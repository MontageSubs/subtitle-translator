import { ProviderResultChunk, ProviderTranslateOptions, TranslationProvider } from "../types";
import { Chapter, Cue, Unit } from "../../core/types";
import { normalizeMicrosoftLang } from "./langCodes";
import { resolveEdgeUserAgent, callMicrosoftApi } from "./transport";
import {
  protectContentHtml,
  GROUP_MARKER_TEMPLATE,
  GROUP_MARKER_PATTERN,
  UNIT_MARKER_TEMPLATE,
  UNIT_MARKER_PATTERN,
  CUE_MARKER_TEMPLATE,
  CUE_MARKER_PATTERN,
  parseTranslatedHtml,
  extractMarkerFreeResponse,
  escapeHtml,
} from "./markerEngine";
import { BilingualMerger } from "../../core/bilingualMerge";
import { coreLog } from "../../core/log";
import { CORRUPT_MARKER_SIGNATURE, hasMarkerLeak, repairCorruptMarkers } from "../shared/markerRepair";

type ApiCall = typeof callMicrosoftApi;
type TermMatchLike = { start: number; end: number; target?: string };

const DEFAULT_REQUEST_CHARS = 8000;
const MAX_CONTEXT_CHARS = 500;
const MAIN_CONCURRENCY = 19;
const RECOVERY_CONCURRENCY = 19;
const SUBREQUEST_LIMIT = 48;
const MAX_INITIAL_DISPATCH = 30;
const LENGTH_RATIO_MIN = 0.15;
const LENGTH_RATIO_MAX = 6.0;
const WINDOW_RADIUS_LADDER = [20, 5, 2];
const ISOLATED_RADIUS_LADDER = [5, 2, 0];

function contentLength(text: string): number {
  const matches = (text || "").match(/\p{L}|\p{N}/gu);
  return matches ? matches.length : 0;
}

function hasContent(text: string): boolean {
  return contentLength(text) > 0;
}

function isLengthPlausible(sourceText: string, translatedText: string): boolean {
  const sourceLen = contentLength(sourceText);
  if (sourceLen === 0) return true;
  const ratio = contentLength(translatedText) / sourceLen;
  return ratio >= LENGTH_RATIO_MIN && ratio <= LENGTH_RATIO_MAX;
}

const WORD_BASED_SCRIPTS = new Set(["latin", "cyrillic", "arabic", "devanagari", "hebrew", "greek"]);
const SCRIPT_CHAR_RANGES: Record<string, string> = {
  latin: "A-Za-z", cyrillic: "\u0400-\u04ff", arabic: "\u0600-\u06ff", devanagari: "\u0900-\u097f",
  hebrew: "\u0590-\u05ff", greek: "\u0370-\u03ff", cjk: "\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af", thai: "\u0e00-\u0e7f",
};
const SCRIPT_LEAK_PATTERNS: Record<string, RegExp> = Object.fromEntries(
  Object.entries(SCRIPT_CHAR_RANGES).map(([name, chars]) => [
    name,
    new RegExp(WORD_BASED_SCRIPTS.has(name) ? `[${chars}]{2,}` : `[${chars}]`, "g"),
  ])
);
const LANGUAGE_SCRIPTS: Record<string, string> = {
  en: "latin", es: "latin", fr: "latin", de: "latin", it: "latin", pt: "latin", nl: "latin", pl: "latin",
  sv: "latin", da: "latin", no: "latin", fi: "latin", ro: "latin", cs: "latin", hu: "latin", tr: "latin",
  id: "latin", vi: "latin", ms: "latin", tl: "latin", ca: "latin", eu: "latin", gl: "latin", la: "latin",
  zh: "cjk", ja: "cjk", ko: "cjk", ru: "cyrillic", uk: "cyrillic", bg: "cyrillic",
  ar: "arabic", fa: "arabic", ur: "arabic", hi: "devanagari", ne: "devanagari", mr: "devanagari",
  th: "thai", he: "hebrew", el: "greek",
};

function scriptOf(lang: string | undefined | null): string | undefined {
  return LANGUAGE_SCRIPTS[(lang || "").split("-")[0].toLowerCase()];
}

function isUntranslated(text: string, sourceLang: string, targetLang: string): boolean {
  if (!text) return false;
  const sourceScript = scriptOf(sourceLang);
  const targetScript = scriptOf(targetLang);
  if (!sourceScript || !targetScript || sourceScript === targetScript) return false;
  return (text.match(SCRIPT_LEAK_PATTERNS[sourceScript]) || []).length >= 1;
}

function wordCount(text: string): number {
  return ((text || "").match(/[\p{L}\p{N}_]+/gu) || []).length;
}

function normalizeForEquality(text: string): string {
  return (text || "").replace(/[\p{P}\p{N}\s]/gu, "");
}

function isLeakedUntranslated(original: string, translated: string, sourceLang: string, targetLang: string): boolean {
  if (!translated) return false;
  const normOrig = normalizeForEquality(original);
  if (!normOrig) return false;
  
  const sl = scriptOf(sourceLang);
  const tl = scriptOf(targetLang);
  if (sl === "latin" && tl === "cjk") {
  } else if (sl === "cjk" && tl === "latin") {
  } else {
    if (wordCount(original) < 2) return false;
  }
  
  return normOrig === normalizeForEquality(translated);
}

function unitCueIds(unit: Unit): number[] {
  return (unit.spans || []).map((s) => s.id);
}

function isSinglePlainCue(unit: Unit): boolean {
  return unitCueIds(unit).length === 1 && expectedCueIds(unit).length === 0;
}

function findLeakedCueIds(unit: Unit, text: string, sourceLang: string, targetLang: string): number[] {
  const markerIds = expectedCueIds(unit);
  if (markerIds.length > 0) {
    const chunks = splitCueChunks(text);
    const spanText = new Map<number, string>((unit.spans || []).filter((s) => s.boundary === "marker").map((s): [number, string] => [s.id, s.text]));
    return markerIds.filter((cid) => chunks[cid] !== undefined && isLeakedUntranslated(spanText.get(cid) || "", chunks[cid]!, sourceLang, targetLang));
  }
  const ids = unitCueIds(unit);
  return ids.length === 1 && isLeakedUntranslated(unit.text, text, sourceLang, targetLang) ? ids : [];
}

function hasTranslatableContent(text: string, termMatches: TermMatchLike[]): boolean {
  let cursor = 0;
  const residue: string[] = [];
  for (const m of [...termMatches].sort((a, b) => a.start - b.start)) {
    residue.push(text.slice(cursor, m.start));
    cursor = m.end;
  }
  residue.push(text.slice(cursor));
  return hasContent(residue.join(""));
}

interface GroupItem {
  id: number;
  text: string;
  html: string;
}

function itemWireChars(item: GroupItem): number {
  return GROUP_MARKER_TEMPLATE(item.id).length + item.html.length;
}

function splitOversized(items: GroupItem[], limit: number): { pieces: GroupItem[][]; oversized: GroupItem[] } {
  const pieces: GroupItem[][] = [];
  let piece: GroupItem[] = [];
  let pieceChars = 0;
  const oversized: GroupItem[] = [];

  for (const item of items) {
    const itemChars = itemWireChars(item);
    if (itemChars > limit) {
      oversized.push(item);
      continue;
    }
    if (piece.length > 0 && pieceChars + itemChars > limit) {
      pieces.push(piece);
      piece = [];
      pieceChars = 0;
    }
    piece.push(item);
    pieceChars += itemChars;
  }
  if (piece.length > 0) pieces.push(piece);
  return { pieces, oversized };
}

function buildSegmentGroups(
  items: GroupItem[],
  chapterGroups: number[][],
  segmentChars: number
): { segments: GroupItem[][][]; oversized: GroupItem[] } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const segments: GroupItem[][][] = [];
  const oversized: GroupItem[] = [];
  let current: GroupItem[][] = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length > 0) segments.push(current);
    current = [];
    currentChars = 0;
  };

  const limit = Math.max(segmentChars, 100);

  for (const group of chapterGroups) {
    const groupItems: GroupItem[] = [];
    for (const id of group) {
      const it = byId.get(id);
      if (it) groupItems.push(it);
    }
    if (groupItems.length === 0) continue;
    const groupChars = groupItems.reduce((acc, it) => acc + itemWireChars(it), 0);

    if (groupChars > limit) {
      flush();
      const { pieces, oversized: groupOversized } = splitOversized(groupItems, limit);
      for (const piece of pieces) segments.push([piece]);
      oversized.push(...groupOversized);
    } else if (currentChars + groupChars > limit) {
      flush();
      current = [groupItems];
      currentChars = groupChars;
    } else {
      current.push(groupItems);
      currentChars += groupChars;
    }
  }
  flush();
  return { segments, oversized };
}

function splitCueChunks(text: string): Record<number, string> {
  const parts = (text || "").split(/⟦c(\d+)⟧/g);
  const result: Record<number, string> = {};
  const seen = new Set<number>();
  for (let i = 1; i < parts.length; i += 2) {
    const cid = parseInt(parts[i]!, 10);
    if (seen.has(cid)) continue;
    seen.add(cid);
    result[cid] = (parts[i + 1] || "").trim();
  }
  return result;
}

function expectedCueIds(unit: Unit): number[] {
  return (unit.spans || []).filter((s) => s.boundary === "marker").map((s) => s.id);
}

function missingCueIds(unit: Unit, text: string): number[] {
  const expected = expectedCueIds(unit);
  if (expected.length === 0) return [];
  const present = splitCueChunks(text);
  return expected.filter((cid) => !(cid in present));
}

function patchMissingCues(text: string, expectedIds: number[], recovered: Record<number, string>): string {
  if (!recovered || Object.keys(recovered).length === 0) return text;
  const chunks = splitCueChunks(text);
  Object.assign(chunks, recovered);
  let res = "";
  for (const cid of expectedIds) {
    if (cid in chunks) res += `${CUE_MARKER_TEMPLATE(cid)}${chunks[cid]}`;
  }
  return res || text;
}

async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await task(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, worker));
}

function packByChars(payloads: string[], maxCharsPerRequest: number): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  let currentChars = 0;
  payloads.forEach((payload, index) => {
    if (current.length > 0 && (currentChars + payload.length > maxCharsPerRequest || current.length >= 50)) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(index);
    currentChars += payload.length;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function runPackedJobs(
  payloads: string[],
  maxCharsPerRequest: number,
  sourceLang: string,
  targetLang: string,
  userAgent: string,
  apiCall: ApiCall
): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(payloads.length).fill(null);
  if (payloads.length === 0) return results;
  const chunks = packByChars(payloads, maxCharsPerRequest);
  await runWithConcurrency(chunks, RECOVERY_CONCURRENCY, async (indices) => {
    try {
      const resp = await apiCall(indices.map((i) => payloads[i]!), sourceLang, targetLang, userAgent);
      indices.forEach((originalIndex, i) => {
        const text = resp?.[i]?.translations?.[0]?.text;
        if (text) results[originalIndex] = text;
      });
    } catch (e: any) {
      coreLog("translate", `packed jobs chunk failed: ${e?.message || e}`);
    }
  });
  return results;
}

interface PlainEntry {
  id: number;
  payload: string;
  original: string;
  unit: Unit;
}

async function recoverPlainItems(
  entries: PlainEntry[],
  sourceLang: string,
  targetLang: string,
  requestCharBudget: number,
  userAgent: string,
  apiCall: ApiCall
): Promise<Record<number, string>> {
  if (entries.length === 0) return {};
  const htmlResults = await runPackedJobs(entries.map((e) => e.payload), requestCharBudget, sourceLang, targetLang, userAgent, apiCall);
  const recovered: Record<number, string> = {};
  entries.forEach((entry, i) => {
    const html = htmlResults[i];
    if (!html) return;
    let text = extractMarkerFreeResponse(html);
    const expected = expectedCueIds(entry.unit);
    if (expected.length > 0) text = repairCorruptMarkers(text, "c", expected);
    if (text && !CORRUPT_MARKER_SIGNATURE.test(text) && isLengthPlausible(entry.original, text)) {
      recovered[entry.id] = text;
    }
  });
  return recovered;
}

async function retryWindowedAll(
  units: Unit[],
  suspectIds: number[],
  sourceLang: string,
  targetLang: string,
  requestCharBudget: number,
  userAgent: string,
  apiCall: ApiCall,
  ladder: number[] = WINDOW_RADIUS_LADDER,
  strictMarker: boolean = false
): Promise<Record<number, string>> {
  const recovered: Record<number, string> = {};
  const indexOf = new Map(units.map((u, i) => [u.id, i]));
  const unitById = new Map(units.map((u) => [u.id, u]));

  const jobs: { suspectId: number; radius: number; payload: string; windowIds: number[]; keepIds: Set<number>; isSolo: boolean }[] = [];

  for (const suspectId of suspectIds) {
    const index = indexOf.get(suspectId);
    if (index === undefined) continue;
    for (const radius of ladder) {
      const window = units.slice(Math.max(0, index - radius), index + radius + 1);
      if (window.length < 1) continue;
      const isSolo = window.length === 1;
      const payload = window.map((u) => `${isSolo ? "" : UNIT_MARKER_TEMPLATE(u.id)}${protectContentHtml(u.text, u.term_matches || [])}`).join("");
      if (payload.length > requestCharBudget) continue;
      const keepRadius = Math.min(2, radius);
      const keepIds = new Set(units.slice(Math.max(0, index - keepRadius), index + keepRadius + 1).map((u) => u.id));
      jobs.push({ suspectId, radius, payload, windowIds: window.map((u) => u.id), keepIds, isSolo });
    }
  }

  if (jobs.length === 0) return recovered;

  const htmlResults = await runPackedJobs(jobs.map((j) => j.payload), requestCharBudget, sourceLang, targetLang, userAgent, apiCall);
  const resultsBySuspect = new Map<number, Map<number, Record<number, string>>>();

  jobs.forEach((job, i) => {
    const html = htmlResults[i];
    if (!html) return;
    
    let parsed: Record<number, string>;
    if (job.isSolo) {
      parsed = { [job.windowIds[0]!]: extractMarkerFreeResponse(html) };
    } else {
      parsed = parseTranslatedHtml(html, UNIT_MARKER_PATTERN, "u", job.windowIds);
    }
    
    if (strictMarker && job.radius > 0) {
      let hasMissing = false;
      for (const kid of job.keepIds) {
        if (!(String(kid) in parsed)) {
          hasMissing = true;
          break;
        }
      }
      if (hasMissing) return;
    }

    const jobRecovered: Record<number, string> = {};
    for (const [uidStr, textRaw] of Object.entries(parsed)) {
      const uid = Number(uidStr);
      const unit = unitById.get(uid);
      if (unit && job.keepIds.has(uid)) {
        let text = textRaw;
        const expected = expectedCueIds(unit);
        if (expected.length > 0) text = repairCorruptMarkers(text, "c", expected);
        if (!CORRUPT_MARKER_SIGNATURE.test(text) && (job.radius === 0 || isLengthPlausible(unit.text, text))) {
          jobRecovered[uid] = text;
        }
      }
    }
    if (Object.keys(jobRecovered).length > 0) {
      if (!resultsBySuspect.has(job.suspectId)) resultsBySuspect.set(job.suspectId, new Map());
      resultsBySuspect.get(job.suspectId)!.set(job.radius, jobRecovered);
    }
  });

  for (const suspectId of suspectIds) {
    for (const radius of ladder) {
      const res = resultsBySuspect.get(suspectId)?.get(radius);
      if (res && Object.keys(res).length > 0) {
        Object.assign(recovered, res);
        break;
      }
    }
  }

  return recovered;
}

async function retryIsolatedCuesAll(
  missingByUnit: Map<number, number[]>,
  cueOrder: number[],
  cueTextById: Map<number, string>,
  cueTermMatches: Map<number, TermMatchLike[]>,
  sourceLang: string,
  targetLang: string,
  requestCharBudget: number,
  userAgent: string,
  apiCall: ApiCall,
  extraValid?: (original: string, candidate: string) => boolean
): Promise<Map<number, Record<number, string>>> {
  const position = new Map(cueOrder.map((cid, i) => [cid, i]));
  const recoveredByUnit = new Map<number, Record<number, string>>();
  const jobs: { unitId: number; radius: number; payload: string; sentIds: number[]; isSolo: boolean; missingIds: number[] }[] = [];

  for (const [unitId, missingIds] of missingByUnit) {
    const positions = missingIds
      .map((cid) => position.get(cid))
      .filter((p): p is number => p !== undefined)
      .sort((a, b) => a - b);
    if (positions.length === 0) continue;

    for (const radius of ISOLATED_RADIUS_LADDER) {
      const lo = Math.max(0, positions[0]! - radius);
      const hi = Math.min(cueOrder.length - 1, positions[positions.length - 1]! + radius);
      const isSolo = hi === lo;
      const sentIds: number[] = [];
      let payload = "";
      for (let i = lo; i <= hi; i++) {
        const cid = cueOrder[i]!;
        const text = cueTextById.get(cid);
        if (text === undefined) continue;
        const matches = cueTermMatches.get(cid) || [];
        payload += `${isSolo ? "" : CUE_MARKER_TEMPLATE(cid)}${protectContentHtml(text, matches)}`;
        sentIds.push(cid);
      }
      if (!payload || payload.length > requestCharBudget) continue;
      jobs.push({ unitId, radius, payload, sentIds, isSolo, missingIds });
    }
  }

  if (jobs.length === 0) return recoveredByUnit;

  const sendJobs: typeof jobs = [];
  const jobSendIndex: number[] = [];
  const seenSoloText = new Map<string, number>();
  for (const job of jobs) {
    if (job.isSolo && job.sentIds.length === 1) {
      const textKey = cueTextById.get(job.sentIds[0]!);
      if (textKey !== undefined && seenSoloText.has(textKey)) {
        jobSendIndex.push(seenSoloText.get(textKey)!);
        continue;
      }
      if (textKey !== undefined) seenSoloText.set(textKey, sendJobs.length);
    }
    jobSendIndex.push(sendJobs.length);
    sendJobs.push(job);
  }

  const htmlResults = await runPackedJobs(sendJobs.map((j) => j.payload), requestCharBudget, sourceLang, targetLang, userAgent, apiCall);
  const resultsByUnit = new Map<number, Map<number, Record<number, string>>>();

  jobs.forEach((job, i) => {
    const html = htmlResults[jobSendIndex[i]!];
    if (!html) return;
    const markerRes = job.isSolo && job.sentIds.length === 1
      ? { [job.sentIds[0]!]: extractMarkerFreeResponse(html) }
      : parseTranslatedHtml(html, CUE_MARKER_PATTERN, "c", job.sentIds);

    const jobRecovered: Record<number, string> = {};
    for (const cid of job.missingIds) {
      let cand = markerRes[cid];
      if (job.isSolo && cand) cand = repairCorruptMarkers(cand, "c", [cid]);
      const orig = cueTextById.get(cid) || "";
      if (cand && !CORRUPT_MARKER_SIGNATURE.test(cand) && isLengthPlausible(orig, cand) && (!extraValid || extraValid(orig, cand))) {
        jobRecovered[cid] = cand;
      }
    }

    if (Object.keys(jobRecovered).length > 0) {
      if (!resultsByUnit.has(job.unitId)) resultsByUnit.set(job.unitId, new Map());
      resultsByUnit.get(job.unitId)!.set(job.radius, jobRecovered);
    }
  });

  for (const [unitId, missingIds] of missingByUnit) {
    const currentMissing = new Set(missingIds);
    const finalRecovered: Record<number, string> = {};
    for (const radius of ISOLATED_RADIUS_LADDER) {
      if (currentMissing.size === 0) break;
      const res = resultsByUnit.get(unitId)?.get(radius);
      if (!res) continue;
      for (const cid of Array.from(currentMissing)) {
        if (res[cid]) {
          finalRecovered[cid] = res[cid];
          currentMissing.delete(cid);
        }
      }
    }
    if (Object.keys(finalRecovered).length > 0) {
      recoveredByUnit.set(unitId, finalRecovered);
    }
  }

  return recoveredByUnit;
}

export class MicrosoftNmtEdgeProvider implements TranslationProvider {
  async *translate(
    units: Unit[],
    chapters: Chapter[],
    cues: Cue[],
    options: ProviderTranslateOptions
  ): AsyncGenerator<ProviderResultChunk, void, unknown> {
    const requestCharBudget = options.maxChars || DEFAULT_REQUEST_CHARS;
    const targetLang = normalizeMicrosoftLang(options.targetLang);
    let currentSourceLang = normalizeMicrosoftLang(options.sourceLang);
    const userAgent = resolveEdgeUserAgent(options.clientUserAgent);
    const log = (message: string) => {
      options.onLog?.(message);
      coreLog("translate", message);
    };

    let fetchCount = 0;
    const safeMicrosoftApi: ApiCall = async (texts, sourceLang, targetLang, userAgent) => {
      if (fetchCount >= SUBREQUEST_LIMIT) {
        log("Subrequest physical breaker triggered, gracefully terminating to protect worker invocation limit.");
        throw new Error("Worker subrequest limit breaker triggered");
      }
      fetchCount++;
      return await callMicrosoftApi(texts, sourceLang, targetLang, userAgent);
    };

    let resolvedContext = options.contextText;
    if (resolvedContext && options.contextNeedsTranslation) {
      if (currentSourceLang === "") {
        log("subtitle source language unknown, sampling a probe translation to resolve it first");
        const sample = cues.map((c) => c.text).join(" ").trim().slice(0, 200);
        if (sample) {
          try {
            const probe = await safeMicrosoftApi([escapeHtml(sample)], "", targetLang, userAgent);
            const detected = probe?.[0]?.detectedLanguage?.language;
            if (detected) currentSourceLang = normalizeMicrosoftLang(detected);
          } catch {
            log("source-language probe failed, context will be sent untranslated");
          }
        }
      }
      if (currentSourceLang !== "") {
        log(`translating supplied context into ${currentSourceLang} to match the subtitle`);
        try {
          const resp = await safeMicrosoftApi([escapeHtml(resolvedContext)], "", currentSourceLang, userAgent);
          const translated = resp?.[0]?.translations?.[0]?.text;
          if (translated) resolvedContext = translated;
        } catch {
          log("context translation failed, using the original text as-is");
        }
      }
    }
    if (resolvedContext && resolvedContext.length > Math.min(MAX_CONTEXT_CHARS, requestCharBudget)) {
      resolvedContext = resolvedContext.slice(0, Math.min(MAX_CONTEXT_CHARS, requestCharBudget));
    }
    const contextPrefix = resolvedContext ? `${GROUP_MARKER_TEMPLATE("ctx")}${escapeHtml(resolvedContext)}` : "";

    const resolvedUnits = new Map<number, string>();
    const pendingUnits: Unit[] = [];
    for (const u of units) {
      if (u.resolved !== null && u.resolved !== undefined) resolvedUnits.set(u.id, u.resolved);
      else pendingUnits.push(u);
    }

    const chapterOfUnit = new Map<number, number>();
    for (const chapter of chapters) {
      for (const uid of chapter.unit_ids) chapterOfUnit.set(uid, chapter.id);
    }

    const items: GroupItem[] = [];
    const chapterGroupsMap = new Map<number, number[]>();

    for (const unit of pendingUnits) {
      const cid = chapterOfUnit.get(unit.id) ?? 0;
      const htmlText = protectContentHtml(unit.text, unit.term_matches || []);
      items.push({ id: unit.id, text: unit.text, html: htmlText });
      if (!chapterGroupsMap.has(cid)) chapterGroupsMap.set(cid, []);
      chapterGroupsMap.get(cid)!.push(unit.id);
    }

    let { segments, oversized } = buildSegmentGroups(items, Array.from(chapterGroupsMap.values()), requestCharBudget);
    
    if (segments.length > MAX_INITIAL_DISPATCH) {
      log(`Limiting initial dispatch to ${MAX_INITIAL_DISPATCH} segments (was ${segments.length}) to reserve room for recovery trucks.`);
      segments = segments.slice(0, MAX_INITIAL_DISPATCH);
    }

    for (const item of oversized) log(`unit ${item.id}: ${item.html.length} chars exceeds maxChars (${requestCharBudget}), cue-level content cannot be split further, skipping`);

    log(`Microsoft Edge NMT: Translating ${pendingUnits.length} units across ${segments.length} requests (batch size ${requestCharBudget}, concurrency ${MAIN_CONCURRENCY})`);

    const cumulativeTranslations: Record<string, string> = {};
    for (const [k, v] of resolvedUnits) {
      if (typeof v === "string" && v) cumulativeTranslations[String(k)] = v;
    }
    const merger = await BilingualMerger.create(cues, units, currentSourceLang, targetLang);

    const queue: Record<number, string>[] = [];
    let resolveQueue: (() => void) | null = null;
    let isDone = false;
    const emittedCueTexts = new Map<number, string>();

    const pushChunk = (chunk: Record<number, string>) => {
      queue.push(chunk);
      if (resolveQueue) {
        resolveQueue();
        resolveQueue = null;
      }
    };

    const translateBatchJob = async (segment: GroupItem[][], includeContext: boolean): Promise<Record<number, string>> => {
      const segmentIds = segment.flatMap((group) => group.map((i) => i.id));
      const expectedIds = new Set(segmentIds);
      const result: Record<number, string> = {};

      let segmentStr = "";
      for (const group of segment) for (const item of group) segmentStr += `${GROUP_MARKER_TEMPLATE(item.id)}${item.html}`;
      const payload = includeContext ? `${contextPrefix}${segmentStr}` : segmentStr;

      try {
        const resp = await safeMicrosoftApi([payload], currentSourceLang, targetLang, userAgent);
        if (Array.isArray(resp)) {
          if (currentSourceLang === "" && resp[0]?.detectedLanguage?.language) {
            currentSourceLang = normalizeMicrosoftLang(resp[0].detectedLanguage.language);
            log(`Microsoft Edge NMT: Auto-detected source language "${currentSourceLang}"`);
          }
          const html = resp[0]?.translations?.[0]?.text;
          if (html) {
            const markerRes = parseTranslatedHtml(html, GROUP_MARKER_PATTERN, "m", segmentIds);
            for (const [idxStr, text] of Object.entries(markerRes)) {
              const idx = Number(idxStr);
              if (expectedIds.has(idx)) result[idx] = text;
            }
          }
        }
      } catch (e: any) {
        log(`segment request failed (units ${segmentIds[0]}..${segmentIds[segmentIds.length - 1]}): ${e?.message || e}, deferring to consolidated recovery pass`);
      }

      return result;
    };

    const taskPromise = runWithConcurrency(segments, MAIN_CONCURRENCY, async (segment, index) => {
      const batchRes = await translateBatchJob(segment, true);
      pushChunk(batchRes);
    }).finally(() => {
      isDone = true;
      if (resolveQueue) resolveQueue();
    });

    let lastYieldTime = Date.now();
    while (!isDone || queue.length > 0) {
      if (queue.length > 0) {
        while (queue.length > 0) {
          const chunk = queue.shift()!;
          for (const [k, v] of Object.entries(chunk)) {
            if (typeof v === "string" && v) cumulativeTranslations[String(k)] = v;
          }
        }

        merger.updateSourceLang(currentSourceLang);
        merger.ingest(cumulativeTranslations);

        const now = Date.now();
        if (now - lastYieldTime >= 300 || (isDone && queue.length === 0)) {
          lastYieldTime = now;
          const merged = merger.snapshot();
          const deltaCues = merged.cues.filter((c) => {
            if (c.translation === null) return false;
            if (emittedCueTexts.get(c.id) === c.translation) return false;
            if (isUntranslated(c.translation, currentSourceLang, targetLang)) return false;
            if (hasMarkerLeak(c.text, c.translation)) return false;
            if (CORRUPT_MARKER_SIGNATURE.test(c.translation)) return false;
            if (!isLengthPlausible(c.text, c.translation)) return false;
            return true;
          });

          if (deltaCues.length > 0) {
            for (const c of deltaCues) emittedCueTexts.set(c.id, c.translation!);
            yield {
              cues: deltaCues,
              approx_splits: merged.approx_splits,
              missing_count: merged.missing_count,
              missing_cues: merged.missing_cues,
              quality_warnings: merged.quality_warnings,
              resolvedSourceLang: currentSourceLang,
              provider: "microsoft-nmt-edge",
            };
          }
        }
      } else {
        await new Promise<void>((resolve) => {
          resolveQueue = resolve;
        });
      }
    }

    await taskPromise;

    const unitById = new Map(units.map((u) => [u.id, u]));
    const unitOrder = units.map((u) => u.id);
    const unitPosition = new Map(unitOrder.map((id, i) => [id, i]));
    const bleedVictims = new Set<number>();

    const stillMissing = pendingUnits.filter((u) => !cumulativeTranslations[String(u.id)]);
    if (stillMissing.length > 0) {
      const byId = new Map(items.map((i) => [i.id, i]));
      const entries: PlainEntry[] = stillMissing
        .map((u) => byId.get(u.id))
        .filter((i): i is GroupItem => !!i)
        .map((item) => ({ id: item.id, payload: item.html, original: item.text, unit: unitById.get(item.id)! }));
      const recovered = await recoverPlainItems(entries, currentSourceLang, targetLang, requestCharBudget, userAgent, safeMicrosoftApi);
      for (const [idStr, text] of Object.entries(recovered)) {
        const id = Number(idStr);
        cumulativeTranslations[idStr] = text;
        const pos = unitPosition.get(id);
        if (pos !== undefined && pos > 0) {
          const precedingId = unitOrder[pos - 1]!;
          bleedVictims.add(precedingId);
          log(`unit ${precedingId}: preceded a unit whose own marker went missing, adding to retry as a precaution against bleed-through`);
        }
      }
    }

    const untranslatedUnits = pendingUnits.filter((u) => {
      const text = cumulativeTranslations[String(u.id)];
      return !!text && isUntranslated(text, currentSourceLang, targetLang);
    });
    if (untranslatedUnits.length > 0) {
      const entries: PlainEntry[] = untranslatedUnits.map((u) => ({
        id: u.id,
        payload: protectContentHtml(u.text, u.term_matches || []),
        original: u.text,
        unit: u,
      }));
      const recovered = await recoverPlainItems(entries, currentSourceLang, targetLang, requestCharBudget, userAgent, safeMicrosoftApi);
      for (const [idStr, text] of Object.entries(recovered)) cumulativeTranslations[idStr] = text;
    }

    for (const unit of pendingUnits) {
      const text = cumulativeTranslations[String(unit.id)];
      const expected = expectedCueIds(unit);
      if (text && expected.length > 0) cumulativeTranslations[String(unit.id)] = repairCorruptMarkers(text, "c", expected);
    }

    const lengthSuspects = new Set<number>();
    const cueSuspects = new Set<number>();
    for (const unit of pendingUnits) {
      const text = cumulativeTranslations[String(unit.id)];
      if (!text || !hasContent(unit.text)) continue;
      if (!hasContent(text) || !isLengthPlausible(unit.text, text)) lengthSuspects.add(unit.id);
      if (missingCueIds(unit, text).length > 0 || CORRUPT_MARKER_SIGNATURE.test(text) || hasMarkerLeak(unit.text, text)) {
        cueSuspects.add(unit.id);
      }
    }

    const markerableCueIds = new Set(units.flatMap((u) => expectedCueIds(u)));
    const cueOrder = cues.map((c) => c.id).filter((id) => markerableCueIds.has(id));
    const cueTextById = new Map(cues.filter((c) => markerableCueIds.has(c.id)).map((c) => [c.id, c.text]));
    const cueTermMatches = new Map<number, TermMatchLike[]>();

    for (const unit of units) {
      const spans = unit.spans || [];
      const termMatches = unit.term_matches || [];
      if (spans.length <= 1) {
        for (const span of spans) cueTermMatches.set(span.id, termMatches);
      } else {
        let cursor = 0;
        for (const span of spans) {
          const pos = unit.text.indexOf(span.text, cursor);
          if (pos === -1) {
            cueTermMatches.set(span.id, []);
            continue;
          }
          const start = pos;
          const end = pos + span.text.length;
          cursor = end;
          cueTermMatches.set(
            span.id,
            termMatches.filter((m) => start <= m.start && m.end <= end).map((m) => ({ start: m.start - start, end: m.end - start, target: m.target }))
          );
        }
      }
    }

    const primarySuspects = new Set([...lengthSuspects, ...cueSuspects]);
    const allSuspects = new Set(primarySuspects);
    for (const uid of bleedVictims) {
      if (unitById.has(uid) && !primarySuspects.has(uid)) allSuspects.add(uid);
    }
    const bleedNeighbors = new Set<number>();
    for (const uid of cueSuspects) {
      const pos = unitPosition.get(uid);
      if (pos === undefined || pos === 0) continue;
      const precedingId = unitOrder[pos - 1]!;
      bleedNeighbors.add(precedingId);
      if (!primarySuspects.has(precedingId)) {
        allSuspects.add(precedingId);
        log(`unit ${precedingId}: adjacent to corrupt-marker unit ${uid}, adding to retry as a precaution against bleed-through`);
      }
    }

    if (allSuspects.size > 0) {
      const markerLossSuspects = new Set<number>();
      const normalSuspects = new Set<number>();
      for (const uid of allSuspects) {
        if (bleedVictims.has(uid) || bleedNeighbors.has(uid) || cueSuspects.has(uid)) markerLossSuspects.add(uid);
        else normalSuspects.add(uid);
      }

      if (normalSuspects.size > 0) {
        const windowedRecovered = await retryWindowedAll(units, Array.from(normalSuspects), currentSourceLang, targetLang, requestCharBudget, userAgent, safeMicrosoftApi);
        if (Object.keys(windowedRecovered).length > 0) {
          log(`windowed retry: recovered [${Object.keys(windowedRecovered).join(",")}]`);
          Object.assign(cumulativeTranslations, windowedRecovered);
        }
      }

      if (markerLossSuspects.size > 0) {
        const windowedRecovered = await retryWindowedAll(units, Array.from(markerLossSuspects), currentSourceLang, targetLang, requestCharBudget, userAgent, safeMicrosoftApi, [5, 1, 0], true);
        if (Object.keys(windowedRecovered).length > 0) {
          log(`windowed retry (marker loss): recovered [${Object.keys(windowedRecovered).join(",")}]`);
          Object.assign(cumulativeTranslations, windowedRecovered);
        }
      }

      const missingByUnit = new Map<number, number[]>();
      for (const uid of allSuspects) {
        const unit = unitById.get(uid);
        if (!unit) continue;
        const expected = expectedCueIds(unit);
        let currentText = cumulativeTranslations[String(uid)] || "";
        if (expected.length > 0) {
          currentText = repairCorruptMarkers(currentText, "c", expected);
          cumulativeTranslations[String(uid)] = currentText;
        }
        const remaining = missingCueIds(unit, currentText);
        if (remaining.length === 0) continue;

        const trivial = remaining.filter((cid) => !hasTranslatableContent(cueTextById.get(cid) || "", cueTermMatches.get(cid) || []));
        let nonTrivial = remaining;
        if (trivial.length > 0) {
          const filled: Record<number, string> = {};
          for (const cid of trivial) filled[cid] = cueTextById.get(cid) || "";
          cumulativeTranslations[String(uid)] = patchMissingCues(currentText, expectedCueIds(unit), filled);
          nonTrivial = remaining.filter((cid) => !trivial.includes(cid));
        }
        if (nonTrivial.length > 0) missingByUnit.set(uid, nonTrivial);
      }

      if (missingByUnit.size > 0) {
        const recoveredByUnit = await retryIsolatedCuesAll(
          missingByUnit, cueOrder, cueTextById, cueTermMatches, currentSourceLang, targetLang, requestCharBudget, userAgent, safeMicrosoftApi
        );
        for (const [uid, recoveredCues] of recoveredByUnit) {
          const unit = unitById.get(uid)!;
          const currentText = cumulativeTranslations[String(uid)] || "";
          cumulativeTranslations[String(uid)] = patchMissingCues(currentText, expectedCueIds(unit), recoveredCues);
          log(`isolated cue retry for unit ${uid}: recovered cues [${Object.keys(recoveredCues).join(",")}]`);
        }
      }
    }

    const leakByUnit = new Map<number, number[]>();
    for (const [idStr, text] of Object.entries(cumulativeTranslations)) {
      const unit = unitById.get(Number(idStr));
      if (!unit) continue;
      const leaked = findLeakedCueIds(unit, text, currentSourceLang, targetLang);
      if (leaked.length > 0) leakByUnit.set(unit.id, leaked);
    }

    if (leakByUnit.size > 0) {
      const leakRecovered = await retryIsolatedCuesAll(
        leakByUnit, cueOrder, cueTextById, cueTermMatches, currentSourceLang, targetLang, requestCharBudget, userAgent, safeMicrosoftApi,
        (orig, cand) => !isLeakedUntranslated(orig, cand, currentSourceLang, targetLang)
      );
      for (const [uid, recoveredCues] of leakRecovered) {
        const unit = unitById.get(uid)!;
        cumulativeTranslations[String(uid)] = isSinglePlainCue(unit)
          ? Object.values(recoveredCues)[0]!
          : patchMissingCues(cumulativeTranslations[String(uid)] || "", expectedCueIds(unit), recoveredCues);
        log(`untranslated-leak retry for unit ${uid}: recovered cues [${Object.keys(recoveredCues).join(",")}]`);
      }
    }

    const cleanedTranslations: Record<string, string> = {};
    for (const [k, v] of Object.entries(cumulativeTranslations)) {
      if (typeof v === "string" && v.trim().length > 0) cleanedTranslations[k] = v.trim();
    }

    merger.updateSourceLang(currentSourceLang);
    merger.ingest(cleanedTranslations);
    const finalMerged = merger.snapshot(log);
    const finalDeltaCues = finalMerged.cues.filter((c) => {
      if (c.translation === null) return false;
      if (emittedCueTexts.get(c.id) === c.translation) return false;
      return true;
    });
    for (const c of finalDeltaCues) emittedCueTexts.set(c.id, c.translation!);

    yield {
      cues: finalDeltaCues,
      approx_splits: finalMerged.approx_splits,
      missing_count: finalMerged.missing_count,
      missing_cues: finalMerged.missing_cues,
      quality_warnings: finalMerged.quality_warnings,
      resolvedSourceLang: currentSourceLang,
      provider: "microsoft-nmt-edge",
    };
  }
}
