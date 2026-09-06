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
  restoreFormattingTags,
  sanitizeStyleTags,
} from "./markerEngine";
import { BilingualMerger } from "../../core/bilingualMerge";
import { coreLog } from "../../core/log";
import { CORRUPT_MARKER_SIGNATURE, hasMarkerLeak, repairCorruptMarkers, stripMarkerDebris } from "../shared/markerRepair";
import { compareMarkerIds } from "../../core/cueMarker";
import { withSubrequestBudget } from "../shared/subrequestGuard";
import { reserveInitialDispatch } from "../shared/dispatchReserve";

type ApiCall = typeof callMicrosoftApi;
type BudgetedApiCall = ApiCall & { readonly exhausted?: boolean };
type TermMatchLike = { start: number; end: number; target?: string };

const DEFAULT_REQUEST_CHARS = 8000;
const MAX_CONTEXT_CHARS = 500;
const MAIN_CONCURRENCY = 19;
const RECOVERY_CONCURRENCY = 19;
const SUBREQUEST_LIMIT = 35;
const LENGTH_RATIO_MIN = 0.15;
const LENGTH_RATIO_MAX = 6.0;
const WINDOW_RADIUS_LADDER = [5, 3, 1, 0];
const ISOLATED_RADIUS_LADDER = [5, 3, 1, 0];

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
    new RegExp(WORD_BASED_SCRIPTS.has(name) ? `[${chars}]{2,}` : `[${chars}]`),
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

const STYLE_AND_TAG_STRIP_PATTERN = /\{\\[^}]*\}|<[^>]*>|\u27e6[^\u27e6\u27e7]*\u27e7/g;
const UNTRANSLATED_WORD_PAIR_THRESHOLD = 2;

function isUntranslated(text: string, sourceLang: string, targetLang: string): boolean {
  if (!text) return false;
  const sourceScript = scriptOf(sourceLang);
  const targetScript = scriptOf(targetLang);
  if (!sourceScript || !targetScript || sourceScript === targetScript) return false;

  const clean = text.replace(STYLE_AND_TAG_STRIP_PATTERN, "").trim();
  if (!clean) return false;

  const pattern = SCRIPT_LEAK_PATTERNS[sourceScript];
  if (!pattern) return false;
  const leaked = clean.match(new RegExp(pattern.source, "g")) || [];
  const threshold = WORD_BASED_SCRIPTS.has(sourceScript) && WORD_BASED_SCRIPTS.has(targetScript)
    ? UNTRANSLATED_WORD_PAIR_THRESHOLD
    : 0;
  return leaked.length > threshold;
}

const STYLE_TAG_STRIP_PATTERN = /<\/?(?:i|b|u)>/gi;

function wordCount(text: string): number {
  return ((text || "").replace(STYLE_TAG_STRIP_PATTERN, "").match(/[\p{L}\p{N}_]+/gu) || []).length;
}

function normalizeForEquality(text: string): string {
  return (text || "").replace(STYLE_TAG_STRIP_PATTERN, "").replace(/[\p{P}\p{N}\s\u2669\u266A\u266B\u266C]/gu, "");
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

function findLeakedCueIds(unit: Unit, text: string, sourceLang: string, targetLang: string): string[] {
  const markerIds = expectedCueIds(unit);
  if (markerIds.length > 0) {
    const chunks = splitCueChunks(text);
    const spanText = new Map((unit.spans || []).filter((s) => s.boundary === "marker").map((s): [string, string] => [s.marker_id, s.text]));
    return markerIds.filter((cid) => chunks[cid] !== undefined && isLeakedUntranslated(spanText.get(cid) || "", chunks[cid]!, sourceLang, targetLang));
  }
  const ids = unitCueIds(unit);
  return ids.length === 1 && isLeakedUntranslated(unit.text, text, sourceLang, targetLang) ? [String(ids[0])] : [];
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

function splitCueChunks(text: string): Record<string, string> {
  const parts = (text || "").split(CUE_MARKER_PATTERN);
  const result: Record<string, string> = {};
  const seen = new Set<string>();
  for (let i = 1; i < parts.length; i += 2) {
    const cid = parts[i]!;
    if (seen.has(cid)) {
      delete result[cid];
      continue;
    }
    seen.add(cid);
    result[cid] = (parts[i + 1] || "").trim();
  }
  return result;
}

function expectedCueIds(unit: Unit): string[] {
  return (unit.spans || []).filter((s) => s.boundary === "marker").map((s) => s.marker_id);
}

function missingCueIds(unit: Unit, text: string): string[] {
  const expected = expectedCueIds(unit);
  if (expected.length === 0) return [];
  const present = splitCueChunks(text);
  return expected.filter((cid) => !(cid in present));
}

function patchMissingCues(text: string, expectedIds: string[], recovered: Record<string, string>): string {
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
  apiCall: BudgetedApiCall,
  onLog?: (msg: string) => void
): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(payloads.length).fill(null);
  if (payloads.length === 0) return results;
  const chunks = packByChars(payloads, maxCharsPerRequest);
  let exhaustedLogged = false;
  await runWithConcurrency(chunks, RECOVERY_CONCURRENCY, async (indices) => {
    if (apiCall.exhausted) {
      if (!exhaustedLogged) {
        exhaustedLogged = true;
        onLog?.("subrequest budget exhausted, skipping remaining recovery job(s)");
      }
      return;
    }
    try {
      const resp = await apiCall(indices.map((i) => payloads[i]!), sourceLang, targetLang, userAgent);
      indices.forEach((originalIndex, i) => {
        const text = resp?.[i]?.translations?.[0]?.text;
        if (text) results[originalIndex] = text;
      });
    } catch (e: any) {
      onLog?.(`packed jobs chunk failed: ${e?.message || e}`);
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
  apiCall: ApiCall,
  onLog?: (msg: string) => void
): Promise<Record<number, string>> {
  if (entries.length === 0) return {};
  const htmlResults = await runPackedJobs(entries.map((e) => e.payload), requestCharBudget, sourceLang, targetLang, userAgent, apiCall, onLog);
  const recovered: Record<number, string> = {};
  entries.forEach((entry, i) => {
    const html = htmlResults[i];
    if (!html) return;
    let text = extractMarkerFreeResponse(html);
    const expected = expectedCueIds(entry.unit);
    if (expected.length > 0) text = repairCorruptMarkers(text, "c", expected);
    if (text && !CORRUPT_MARKER_SIGNATURE.test(text) && !isUntranslated(text, sourceLang, targetLang) && isLengthPlausible(entry.original, text)) {
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
  apiCall: BudgetedApiCall,
  onLog?: (msg: string) => void,
  ladder: number[] = WINDOW_RADIUS_LADDER,
  strictMarker: boolean = false
): Promise<Record<number, string>> {
  const recovered: Record<number, string> = {};
  const indexOf = new Map(units.map((u, i) => [u.id, i]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  let pending = suspectIds.filter((id) => indexOf.has(id));

  for (const radius of ladder) {
    if (pending.length === 0 || apiCall.exhausted) break;

    const jobs: { suspectId: number; payload: string; windowIds: number[]; isSolo: boolean }[] = [];
    for (const suspectId of pending) {
      const index = indexOf.get(suspectId)!;
      const window = units.slice(Math.max(0, index - radius), index + radius + 1);
      if (window.length < 1) continue;
      const isSolo = window.length === 1;
      const payload = window.map((u) => `${isSolo ? "" : UNIT_MARKER_TEMPLATE(u.id)}${protectContentHtml(u.text, u.term_matches || [])}`).join("");
      if (payload.length > requestCharBudget) continue;
      jobs.push({ suspectId, payload, windowIds: window.map((u) => u.id), isSolo });
    }
    if (jobs.length === 0) continue;

    const sendJobs: typeof jobs = [];
    const jobSendIndex: number[] = [];
    const seenSoloText = new Map<string, number>();
    for (const job of jobs) {
      if (job.isSolo && job.windowIds.length === 1) {
        const textKey = unitById.get(job.windowIds[0]!)?.text || "";
        if (textKey && seenSoloText.has(textKey)) {
          jobSendIndex.push(seenSoloText.get(textKey)!);
          continue;
        }
        if (textKey) seenSoloText.set(textKey, sendJobs.length);
      }
      jobSendIndex.push(sendJobs.length);
      sendJobs.push(job);
    }

    const htmlResults = await runPackedJobs(sendJobs.map((j) => j.payload), requestCharBudget, sourceLang, targetLang, userAgent, apiCall, onLog);
    const resolvedThisRound = new Set<number>();

    jobs.forEach((job, i) => {
      const html = htmlResults[jobSendIndex[i]!];
      if (!html) return;

      let parsed: Record<string, string>;
      if (job.isSolo) {
        parsed = { [job.windowIds[0]!]: extractMarkerFreeResponse(html) };
      } else {
        parsed = parseTranslatedHtml(html, UNIT_MARKER_PATTERN, "u", job.windowIds);
        if (!job.windowIds.every((id) => id in parsed)) return;
      }

      if (strictMarker && radius > 0 && !(job.suspectId in parsed)) return;

      const textRaw = parsed[job.suspectId];
      if (textRaw === undefined) return;
      const unit = unitById.get(job.suspectId);
      if (!unit) return;
      let text = textRaw;
      const expected = expectedCueIds(unit);
      if (expected.length > 0) text = repairCorruptMarkers(text, "c", expected);
      if (!CORRUPT_MARKER_SIGNATURE.test(text) && (radius === 0 || isLengthPlausible(unit.text, text))) {
        recovered[job.suspectId] = text;
        resolvedThisRound.add(job.suspectId);
      }
    });

    pending = pending.filter((id) => !resolvedThisRound.has(id));
  }

  return recovered;
}

async function retryIsolatedCuesAll(
  missingByUnit: Map<number, string[]>,
  markerOrder: string[],
  markerTextById: Map<string, string>,
  markerTermMatches: Map<string, TermMatchLike[]>,
  sourceLang: string,
  targetLang: string,
  requestCharBudget: number,
  userAgent: string,
  apiCall: BudgetedApiCall,
  onLog?: (msg: string) => void,
  extraValid?: (original: string, candidate: string) => boolean
): Promise<Map<number, Record<string, string>>> {
  const position = new Map(markerOrder.map((cid, i) => [cid, i]));
  const recoveredByUnit = new Map<number, Record<string, string>>();

  const anchors = new Map<number, [number, number]>();
  const remainingByUnit = new Map<number, Set<string>>();
  for (const [unitId, missingIds] of missingByUnit) {
    const positions = missingIds.map((cid) => position.get(cid)).filter((p): p is number => p !== undefined).sort((a, b) => a - b);
    if (positions.length === 0) continue;
    anchors.set(unitId, [positions[0]!, positions[positions.length - 1]!]);
    remainingByUnit.set(unitId, new Set(missingIds));
  }

  for (const radius of ISOLATED_RADIUS_LADDER) {
    if (remainingByUnit.size === 0 || apiCall.exhausted) break;

    const jobs: { unitId: number; payload: string; sentIds: string[]; isSolo: boolean; missingIds: string[] }[] = [];
    for (const [unitId, missingIds] of remainingByUnit) {
      const [anchorLo, anchorHi] = anchors.get(unitId)!;
      const lo = Math.max(0, anchorLo - radius);
      const hi = Math.min(markerOrder.length - 1, anchorHi + radius);
      const isSolo = hi === lo;
      const sentIds: string[] = [];
      let payload = "";
      for (let i = lo; i <= hi; i++) {
        const cid = markerOrder[i]!;
        const text = markerTextById.get(cid);
        if (text === undefined) continue;
        const matches = markerTermMatches.get(cid) || [];
        payload += `${isSolo ? "" : CUE_MARKER_TEMPLATE(cid)}${protectContentHtml(text, matches)}`;
        sentIds.push(cid);
      }
      if (!payload || payload.length > requestCharBudget) continue;
      jobs.push({ unitId, payload, sentIds, isSolo, missingIds: Array.from(missingIds) });
    }
    if (jobs.length === 0) continue;

    const sendJobs: typeof jobs = [];
    const jobSendIndex: number[] = [];
    const seenSoloText = new Map<string, number>();
    for (const job of jobs) {
      if (job.isSolo && job.sentIds.length === 1) {
        const textKey = markerTextById.get(job.sentIds[0]!);
        if (textKey !== undefined && seenSoloText.has(textKey)) {
          jobSendIndex.push(seenSoloText.get(textKey)!);
          continue;
        }
        if (textKey !== undefined) seenSoloText.set(textKey, sendJobs.length);
      }
      jobSendIndex.push(sendJobs.length);
      sendJobs.push(job);
    }

    const htmlResults = await runPackedJobs(sendJobs.map((j) => j.payload), requestCharBudget, sourceLang, targetLang, userAgent, apiCall, onLog);

    jobs.forEach((job, i) => {
      const html = htmlResults[jobSendIndex[i]!];
      if (!html) return;
      const markerRes = job.isSolo && job.sentIds.length === 1
        ? { [job.sentIds[0]!]: extractMarkerFreeResponse(html) }
        : parseTranslatedHtml(html, CUE_MARKER_PATTERN, "c", job.sentIds);

      const remaining = remainingByUnit.get(job.unitId);
      if (!remaining) return;
      const jobRecovered: Record<string, string> = {};
      for (const cid of job.missingIds) {
        if (!remaining.has(cid)) continue;
        let cand = markerRes[cid];
        if (job.isSolo && cand) cand = repairCorruptMarkers(cand, "c", [cid]);
        const orig = markerTextById.get(cid) || "";
        if (cand && !CORRUPT_MARKER_SIGNATURE.test(cand) && isLengthPlausible(orig, cand) && (!extraValid || extraValid(orig, cand))) {
          jobRecovered[cid] = cand;
        }
      }

      if (Object.keys(jobRecovered).length > 0) {
        if (!recoveredByUnit.has(job.unitId)) recoveredByUnit.set(job.unitId, {});
        const unitRecovered = recoveredByUnit.get(job.unitId)!;
        for (const [cid, text] of Object.entries(jobRecovered)) {
          unitRecovered[cid] = text;
          remaining.delete(cid);
        }
        if (remaining.size === 0) remainingByUnit.delete(job.unitId);
      }
    });
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
    };

    let breakerTripped = false;
    const safeMicrosoftApi: BudgetedApiCall = withSubrequestBudget(callMicrosoftApi, SUBREQUEST_LIMIT, () => {
      if (!breakerTripped) {
        breakerTripped = true;
        log("Subrequest physical breaker triggered, gracefully terminating to protect worker invocation limit.");
      }
    });

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
    const contextHtml = resolvedContext ? escapeHtml(resolvedContext) : "";

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
    segments = reserveInitialDispatch(segments, SUBREQUEST_LIMIT, (kept, total) => {
      log(`Limiting initial dispatch to ${kept} segments (was ${total}) to reserve room for recovery passes.`);
    });

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

    const translateBatchJob = async (segment: GroupItem[][], isFirstSegment: boolean): Promise<Record<number, string>> => {
      const segmentIds = segment.flatMap((group) => group.map((i) => i.id));
      const expectedIds = new Set(segmentIds);
      const result: Record<number, string> = {};

      let segmentStr = "";
      for (const group of segment) for (const item of group) segmentStr += `${GROUP_MARKER_TEMPLATE(item.id)}${item.html}`;
      const payload = (isFirstSegment && contextHtml) ? `${contextHtml}${segmentStr}` : segmentStr;

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
      const batchRes = await translateBatchJob(segment, index === 0);
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
    const initialMissingIds = new Set(pendingUnits.filter((u) => !cumulativeTranslations[String(u.id)]).map((u) => u.id));
    const missingUnits = pendingUnits.filter((u) => initialMissingIds.has(u.id));

    if (missingUnits.length > 0 && !breakerTripped) {
      const entries: PlainEntry[] = missingUnits.map((u) => ({
        id: u.id,
        payload: protectContentHtml(u.text, u.term_matches || []),
        original: u.text,
        unit: u,
      }));
      const recovered = await recoverPlainItems(entries, currentSourceLang, targetLang, requestCharBudget, userAgent, safeMicrosoftApi, log);
      for (const [idStr, text] of Object.entries(recovered)) cumulativeTranslations[idStr] = text;
    }

    const untranslatedUnits = pendingUnits.filter((u) => {
      const text = cumulativeTranslations[String(u.id)];
      return !!text && isUntranslated(text, currentSourceLang, targetLang);
    });
    if (untranslatedUnits.length > 0 && !breakerTripped) {
      const entries: PlainEntry[] = untranslatedUnits.map((u) => ({
        id: u.id,
        payload: protectContentHtml(u.text, u.term_matches || []),
        original: u.text,
        unit: u,
      }));
      const recovered = await recoverPlainItems(entries, currentSourceLang, targetLang, requestCharBudget, userAgent, safeMicrosoftApi, log);
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
      if (!hasContent(text) || !isLengthPlausible(unit.text, text)) {
        lengthSuspects.add(unit.id);
      }
      if (missingCueIds(unit, text).length > 0 || CORRUPT_MARKER_SIGNATURE.test(text) || hasMarkerLeak(unit.text, text)) {
        cueSuspects.add(unit.id);
      }
    }

    const markerOrder: string[] = [];
    const markerTextById = new Map<string, string>();
    const markerTermMatches = new Map<string, TermMatchLike[]>();

    for (const unit of units) {
      const spans = unit.spans || [];
      const termMatches = unit.term_matches || [];
      const projected = spans.length <= 1
        ? spans.map((span): [string, TermMatchLike[]] => [span.marker_id, termMatches])
        : (() => {
            let cursor = 0;
            return spans.map((span): [string, TermMatchLike[]] => {
              const pos = unit.text.indexOf(span.text, cursor);
              if (pos === -1) return [span.marker_id, []];
              const start = pos, end = pos + span.text.length;
              cursor = end;
              return [span.marker_id, termMatches.filter((m) => start <= m.start && m.end <= end).map((m) => ({ start: m.start - start, end: m.end - start, target: m.target }))];
            });
          })();
      spans.forEach((span, i) => {
        if (span.boundary !== "marker") return;
        markerOrder.push(span.marker_id);
        markerTextById.set(span.marker_id, span.text);
        markerTermMatches.set(span.marker_id, projected[i]![1]);
      });
    }

    const primarySuspects = new Set([...lengthSuspects, ...cueSuspects, ...initialMissingIds]);
    const allSuspects = new Set<number>();
    for (const uid of primarySuspects) {
      allSuspects.add(uid);
      const pos = unitPosition.get(uid);
      if (pos !== undefined) {
        if (pos > 0) allSuspects.add(unitOrder[pos - 1]!);
        if (pos + 1 < unitOrder.length) allSuspects.add(unitOrder[pos + 1]!);
      }
    }

    if (breakerTripped) {
      allSuspects.clear();
    }

    if (allSuspects.size > 0) {
      const suspectList = Array.from(allSuspects).sort((a, b) => a - b);
      const windowedRecovered = await retryWindowedAll(
        units, suspectList, currentSourceLang, targetLang, requestCharBudget, userAgent, safeMicrosoftApi, log, WINDOW_RADIUS_LADDER
      );
      if (Object.keys(windowedRecovered).length > 0) {
        log(`windowed retry: recovered [${Object.keys(windowedRecovered).sort((a, b) => Number(a) - Number(b)).join(",")}]`);
        Object.assign(cumulativeTranslations, windowedRecovered);
      }

      const missingByUnit = new Map<number, string[]>();
      for (const uid of suspectList) {
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

        const trivial = remaining.filter((cid) => !hasTranslatableContent(markerTextById.get(cid) || "", markerTermMatches.get(cid) || []));
        let nonTrivial = remaining;
        if (trivial.length > 0) {
          const filled: Record<string, string> = {};
          for (const cid of trivial) filled[cid] = markerTextById.get(cid) || "";
          cumulativeTranslations[String(uid)] = patchMissingCues(currentText, expectedCueIds(unit), filled);
          nonTrivial = remaining.filter((cid) => !trivial.includes(cid));
        }
        if (nonTrivial.length > 0) missingByUnit.set(uid, nonTrivial);
      }

      if (missingByUnit.size > 0) {
        const recoveredByUnit = await retryIsolatedCuesAll(
          missingByUnit, markerOrder, markerTextById, markerTermMatches, currentSourceLang, targetLang, requestCharBudget, userAgent, safeMicrosoftApi, log
        );
        for (const [uid, recoveredCues] of recoveredByUnit) {
          const unit = unitById.get(uid)!;
          const currentText = cumulativeTranslations[String(uid)] || "";
          cumulativeTranslations[String(uid)] = patchMissingCues(currentText, expectedCueIds(unit), recoveredCues);
          log(`isolated cue retry for unit ${uid}: recovered cues [${Object.keys(recoveredCues).sort(compareMarkerIds).join(",")}]`);
        }
      }
    }

    const leakByUnit = new Map<number, string[]>();
    for (const [idStr, text] of Object.entries(cumulativeTranslations)) {
      const unit = unitById.get(Number(idStr));
      if (!unit) continue;
      const leaked = findLeakedCueIds(unit, text, currentSourceLang, targetLang);
      if (leaked.length > 0) leakByUnit.set(unit.id, leaked);
    }

    if (breakerTripped) {
      leakByUnit.clear();
    }

    if (leakByUnit.size > 0) {
      const leakRecovered = await retryIsolatedCuesAll(
        leakByUnit, markerOrder, markerTextById, markerTermMatches, currentSourceLang, targetLang, requestCharBudget, userAgent, safeMicrosoftApi, log,
        (orig, cand) => !isLeakedUntranslated(orig, cand, currentSourceLang, targetLang)
      );
      for (const [uid, recoveredCues] of leakRecovered) {
        const unit = unitById.get(uid)!;
        cumulativeTranslations[String(uid)] = isSinglePlainCue(unit)
          ? Object.values(recoveredCues)[0]!
          : patchMissingCues(cumulativeTranslations[String(uid)] || "", expectedCueIds(unit), recoveredCues);
        log(`untranslated-leak retry for unit ${uid}: recovered cues [${Object.keys(recoveredCues).sort(compareMarkerIds).join(",")}]`);
      }
    }

    const cleanedTranslations: Record<string, string> = {};
    for (const [k, v] of Object.entries(cumulativeTranslations)) {
      if (typeof v === "string" && v.trim().length > 0) {
        cleanedTranslations[k] = sanitizeStyleTags(stripMarkerDebris(restoreFormattingTags(v)).trim());
      }
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
