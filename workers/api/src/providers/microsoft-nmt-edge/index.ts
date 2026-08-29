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
import { CORRUPT_MARKER_SIGNATURE, hasMarkerLeak } from "../shared/markerRepair";

type ApiCall = typeof callMicrosoftApi;

const DEFAULT_BATCH_CHARS = 8000;
const MIN_BATCH_CHARS = 500;
const MAX_CONTEXT_CHARS = 500;
const DEFAULT_CONCURRENCY = 4;
const ARRAY_BATCH_SEGMENTS = 5;
const RETRY_CHUNK_COUNT = 25;
const RETRY_CHUNK_CHARS = 6000;
const SUBREQUEST_LIMIT = 45;
const LENGTH_RATIO_MIN = 0.15;
const LENGTH_RATIO_MAX = 6.0;
const WINDOW_RADIUS_LADDER = [20, 5, 2];
const ISOLATED_RADIUS_LADDER = [5, 2, 0];

function calculateBatchChars(maxChars: number | undefined): number {
  const configured = maxChars || DEFAULT_BATCH_CHARS;
  const halved = Math.floor(configured / 2);
  return halved >= MIN_BATCH_CHARS ? halved : configured;
}

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
  return (text.match(SCRIPT_LEAK_PATTERNS[sourceScript]) || []).length > 1;
}

function hasTranslatableContent(text: string, termMatches: Array<{ start: number; end: number }>): boolean {
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
  if (piece.length > 0) {
    pieces.push(piece);
  }
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
      for (const piece of pieces) {
        segments.push([piece]);
      }
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
    if (cid in chunks) {
      res += `${CUE_MARKER_TEMPLATE(cid)}${chunks[cid]}`;
    }
  }
  return res || text;
}

interface ArrayRetryEntry {
  id: number;
  payload: string;
  original: string;
}

function chunkEntries(entries: ArrayRetryEntry[], maxCount: number, maxChars: number): ArrayRetryEntry[][] {
  const chunks: ArrayRetryEntry[][] = [];
  let current: ArrayRetryEntry[] = [];
  let currentChars = 0;
  for (const entry of entries) {
    if (current.length > 0 && (current.length >= maxCount || currentChars + entry.payload.length > maxChars)) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(entry);
    currentChars += entry.payload.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function retryArrayBatched(
  entries: ArrayRetryEntry[],
  sourceLang: string,
  targetLang: string,
  userAgent: string,
  apiCall: ApiCall,
  log: (message: string) => void,
  label: string
): Promise<Record<number, string>> {
  const recovered: Record<number, string> = {};
  for (const chunk of chunkEntries(entries, RETRY_CHUNK_COUNT, RETRY_CHUNK_CHARS)) {
    try {
      const resp = await apiCall(chunk.map((e) => e.payload), sourceLang, targetLang, userAgent);
      for (let i = 0; i < chunk.length; i++) {
        const entry = chunk[i]!;
        const entryText = resp?.[i]?.translations?.[0]?.text;
        if (!entryText) continue;
        const text = extractMarkerFreeResponse(entryText);
        if (text && !CORRUPT_MARKER_SIGNATURE.test(text) && isLengthPlausible(entry.original, text)) {
          recovered[entry.id] = text;
        }
      }
    } catch (e: any) {
      log(`${label} failed: ${e.message}`);
    }
  }
  return recovered;
}

async function retryWindowedAtRadius(
  units: Unit[],
  suspectId: number,
  radius: number,
  sourceLang: string,
  targetLang: string,
  batchChars: number,
  userAgent: string,
  apiCall: ApiCall
): Promise<Record<number, string>> {
  const index = units.findIndex((u) => u.id === suspectId);
  if (index === -1) return {};
  const window = units.slice(Math.max(0, index - radius), index + radius + 1);
  if (window.length < 2) return {};

  const windowedText = window
    .map((unit) => `${UNIT_MARKER_TEMPLATE(unit.id)}${protectContentHtml(unit.text, unit.term_matches || [])}`)
    .join("");

  if (windowedText.length > batchChars) return {};

  try {
    const resp = await apiCall([windowedText], sourceLang, targetLang, userAgent);
    if (!resp || resp.length === 0 || !resp[0]?.translations?.[0]) return {};
    const translatedHtml = resp[0].translations[0].text;
    const chunks = parseTranslatedHtml(translatedHtml, UNIT_MARKER_PATTERN, "u", window.map((u) => u.id));

    const keepRadius = Math.min(2, radius);
    const keepIds = new Set(units.slice(Math.max(0, index - keepRadius), index + keepRadius + 1).map((u) => u.id));
    const unitById = new Map(window.map((u) => [u.id, u]));
    const recovered: Record<number, string> = {};
    for (const [uidStr, text] of Object.entries(chunks)) {
      const uid = Number(uidStr);
      const unit = unitById.get(uid);
      if (unit && keepIds.has(uid) && !CORRUPT_MARKER_SIGNATURE.test(text) && isLengthPlausible(unit.text, text)) {
        recovered[uid] = text;
      }
    }
    return recovered;
  } catch {
    return {};
  }
}

async function retryWindowed(
  units: Unit[],
  suspectId: number,
  sourceLang: string,
  targetLang: string,
  batchChars: number,
  userAgent: string,
  apiCall: ApiCall
): Promise<Record<number, string>> {
  for (const radius of WINDOW_RADIUS_LADDER) {
    const recovered = await retryWindowedAtRadius(units, suspectId, radius, sourceLang, targetLang, batchChars, userAgent, apiCall);
    if (Object.keys(recovered).length > 0) return recovered;
  }
  return {};
}

async function retryIsolatedCuesAtRadius(
  missingIds: number[],
  cueOrder: number[],
  cueTextById: Map<number, string>,
  cueTermMatches: Map<number, Array<{ start: number; end: number; target?: string }>>,
  radius: number,
  sourceLang: string,
  targetLang: string,
  batchChars: number,
  userAgent: string,
  apiCall: ApiCall
): Promise<Record<number, string>> {
  const position = new Map(cueOrder.map((cid, i) => [cid, i]));
  const positions = missingIds.map((cid) => position.get(cid)).filter((p): p is number => p !== undefined).sort((a, b) => a - b);
  if (positions.length === 0) return {};

  const lo = Math.max(0, positions[0]! - radius);
  const hi = Math.min(cueOrder.length - 1, positions[positions.length - 1]! + radius);

  const isSolo = hi === lo;
  let html = "";
  const sentIds: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const cid = cueOrder[i]!;
    const text = cueTextById.get(cid);
    if (text !== undefined) {
      const matches = cueTermMatches.get(cid) || [];
      html += `${isSolo ? "" : CUE_MARKER_TEMPLATE(cid)}${protectContentHtml(text, matches)}`;
      sentIds.push(cid);
    }
  }

  if (html.length > batchChars) return {};

  try {
    const resp = await apiCall([html], sourceLang, targetLang, userAgent);
    if (!resp || resp.length === 0 || !resp[0]?.translations?.[0]) return {};
    const translatedHtml = resp[0].translations[0].text;
    const markerRes = isSolo && sentIds.length === 1
      ? { [sentIds[0]!]: extractMarkerFreeResponse(translatedHtml) }
      : parseTranslatedHtml(translatedHtml, CUE_MARKER_PATTERN, "c", sentIds);
    const recovered: Record<number, string> = {};

    for (const cid of missingIds) {
      const cand = markerRes[cid];
      const orig = cueTextById.get(cid) || "";
      if (cand && !CORRUPT_MARKER_SIGNATURE.test(cand) && isLengthPlausible(orig, cand)) {
        recovered[cid] = cand;
      }
    }
    return recovered;
  } catch {
    return {};
  }
}

async function retryIsolatedCues(
  missingIds: number[],
  cueOrder: number[],
  cueTextById: Map<number, string>,
  cueTermMatches: Map<number, Array<{ start: number; end: number; target?: string }>>,
  sourceLang: string,
  targetLang: string,
  batchChars: number,
  userAgent: string,
  apiCall: ApiCall
): Promise<Record<number, string>> {
  const recovered: Record<number, string> = {};
  let remaining = missingIds;
  for (const radius of ISOLATED_RADIUS_LADDER) {
    if (remaining.length === 0) break;
    const got = await retryIsolatedCuesAtRadius(remaining, cueOrder, cueTextById, cueTermMatches, radius, sourceLang, targetLang, batchChars, userAgent, apiCall);
    Object.assign(recovered, got);
    remaining = remaining.filter((cid) => !(cid in got));
  }
  return recovered;
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

export class MicrosoftNmtEdgeProvider implements TranslationProvider {
  async *translate(
    units: Unit[],
    chapters: Chapter[],
    cues: Cue[],
    options: ProviderTranslateOptions
  ): AsyncGenerator<ProviderResultChunk, void, unknown> {
    const batchChars = calculateBatchChars(options.maxChars);
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
    if (resolvedContext && resolvedContext.length > Math.min(MAX_CONTEXT_CHARS, batchChars)) {
      resolvedContext = resolvedContext.slice(0, Math.min(MAX_CONTEXT_CHARS, batchChars));
    }
    const contextPrefix = resolvedContext ? `${GROUP_MARKER_TEMPLATE("ctx")}${escapeHtml(resolvedContext)}` : "";

    const resolvedUnits = new Map<number, string>();
    const pendingUnits: Unit[] = [];
    for (const u of units) {
      if (u.resolved !== null && u.resolved !== undefined) {
        resolvedUnits.set(u.id, u.resolved);
      } else {
        pendingUnits.push(u);
      }
    }

    const chapterOfUnit = new Map<number, number>();
    for (const chapter of chapters) {
      for (const uid of chapter.unit_ids) {
        chapterOfUnit.set(uid, chapter.id);
      }
    }

    const items: GroupItem[] = [];
    const chapterGroupsMap = new Map<number, number[]>();

    for (const unit of pendingUnits) {
      const cid = chapterOfUnit.get(unit.id) ?? 0;
      const htmlText = protectContentHtml(unit.text, unit.term_matches || []);
      items.push({ id: unit.id, text: unit.text, html: htmlText });

      if (!chapterGroupsMap.has(cid)) {
        chapterGroupsMap.set(cid, []);
      }
      chapterGroupsMap.get(cid)!.push(unit.id);
    }

    const { segments, oversized } = buildSegmentGroups(items, Array.from(chapterGroupsMap.values()), batchChars);
    for (const item of oversized) log(`unit ${item.id}: ${item.html.length} chars exceeds maxChars (${batchChars}), cue-level content cannot be split further, skipping`);

    const requestBatches: GroupItem[][][][] = [];
    for (let i = 0; i < segments.length; i += ARRAY_BATCH_SEGMENTS) {
      requestBatches.push(segments.slice(i, i + ARRAY_BATCH_SEGMENTS));
    }

    log(`Microsoft Edge NMT: Translating ${pendingUnits.length} units in ${segments.length} segments across ${requestBatches.length} requests (batch size ${batchChars}, concurrency ${DEFAULT_CONCURRENCY})`);

    const cumulativeTranslations: Record<string, string> = {};
    for (const [k, v] of resolvedUnits) {
      if (typeof v === "string" && v) cumulativeTranslations[String(k)] = v;
    }
    const merger = await BilingualMerger.create(cues, units, currentSourceLang, targetLang);

    const queue: Record<number, string>[] = [];
    let resolveQueue: (() => void) | null = null;
    let isDone = false;
    const emittedCueIds = new Set<number>();
    const bleedVictims = new Set<number>();

    const pushChunk = (chunk: Record<number, string>) => {
      queue.push(chunk);
      if (resolveQueue) {
        resolveQueue();
        resolveQueue = null;
      }
    };

    const translateBatchJob = async (batch: GroupItem[][][], includeContext: boolean): Promise<Record<number, string>> => {
      const segmentIdsList = batch.map((segment) => segment.flatMap((group) => group.map((i) => i.id)));
      const allItems = batch.flatMap((segment) => segment.flatMap((group) => group));
      const expectedIds = new Set(allItems.map((i) => i.id));
      const result: Record<number, string> = {};
      const missing = new Set(expectedIds);

      const buildPayload = (attempt: number) =>
        batch.map((segment, segIdx) => {
          let segmentStr = "";
          for (const group of segment) {
            for (const item of group) {
              segmentStr += `${GROUP_MARKER_TEMPLATE(item.id)}${item.html}`;
            }
          }
          return includeContext && attempt === 1 && segIdx === 0 ? `${contextPrefix}${segmentStr}` : segmentStr;
        });

      let previousMissingSignature: string | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const resp = await safeMicrosoftApi(buildPayload(attempt), currentSourceLang, targetLang, userAgent);
          if (Array.isArray(resp)) {
            if (currentSourceLang === "" && resp[0]?.detectedLanguage?.language) {
              currentSourceLang = normalizeMicrosoftLang(resp[0].detectedLanguage.language);
              log(`Microsoft Edge NMT: Auto-detected source language "${currentSourceLang}"`);
            }

            for (let segIdx = 0; segIdx < resp.length; segIdx++) {
              const html = resp[segIdx]?.translations?.[0]?.text;
              if (!html) continue;
              const segmentIds = segmentIdsList[segIdx] ?? Array.from(expectedIds);
              const markerRes = parseTranslatedHtml(html, GROUP_MARKER_PATTERN, "m", segmentIds);
              for (const [idxStr, text] of Object.entries(markerRes)) {
                const idx = Number(idxStr);
                if (expectedIds.has(idx) && !CORRUPT_MARKER_SIGNATURE.test(text)) {
                  result[idx] = text;
                  missing.delete(idx);
                }
              }
            }
          }

          if (missing.size === 0) break;
          const missingSignature = Array.from(missing).sort((a, b) => a - b).join(",");
          if (missingSignature === previousMissingSignature) {
            log(`batch retry: identical unresolved units [${missingSignature}] after a repeated attempt, giving up on whole-batch resend and falling back to solo retry`);
            break;
          }
          previousMissingSignature = missingSignature;
        } catch (e: any) {
          if (e.message?.includes("breaker triggered") || attempt === 3) break;
          await new Promise((r) => setTimeout(r, 800 * attempt));
        }
      }

      if (allItems.length > 1 && missing.size > 0) {
        const byId = new Map(allItems.map((i) => [i.id, i]));
        const itemIndex = new Map(allItems.map((it, i) => [it.id, i]));
        const missingEntries = Array.from(missing)
          .map((uid) => byId.get(uid))
          .filter((i): i is GroupItem => !!i)
          .map((item) => ({ id: item.id, payload: item.html, original: item.text }));

        const recovered = await retryArrayBatched(missingEntries, currentSourceLang, targetLang, userAgent, safeMicrosoftApi, log, "solo-array retry");
        for (const [idStr, text] of Object.entries(recovered)) {
          const id = Number(idStr);
          result[id] = text;
          missing.delete(id);
          const idx = itemIndex.get(id)!;
          if (idx > 0) bleedVictims.add(allItems[idx - 1]!.id);
        }
      }

      return result;
    };

    const taskPromise = runWithConcurrency(requestBatches, DEFAULT_CONCURRENCY, async (batch, index) => {
      const batchRes = await translateBatchJob(batch, index === 0);
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
            if (typeof v === "string" && v) {
              cumulativeTranslations[String(k)] = v;
            }
          }
        }

        merger.updateSourceLang(currentSourceLang);
        merger.ingest(cumulativeTranslations);

        const now = Date.now();
        if (now - lastYieldTime >= 300 || (isDone && queue.length === 0)) {
          lastYieldTime = now;
          const merged = merger.snapshot();
          const deltaCues = merged.cues.filter((c) => c.translation !== null && !emittedCueIds.has(c.id));

          if (deltaCues.length > 0) {
            for (const c of deltaCues) emittedCueIds.add(c.id);
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

    const untranslatedUnits = pendingUnits.filter((u) => {
      const text = cumulativeTranslations[String(u.id)];
      return !!text && isUntranslated(text, currentSourceLang, targetLang);
    });
    if (untranslatedUnits.length > 0) {
      const entries = untranslatedUnits.map((u) => ({
        id: u.id,
        payload: protectContentHtml(u.text, u.term_matches || []),
        original: u.text,
      }));
      const recovered = await retryArrayBatched(entries, currentSourceLang, targetLang, userAgent, safeMicrosoftApi, log, "untranslated retry");
      for (const [idStr, text] of Object.entries(recovered)) {
        cumulativeTranslations[idStr] = text;
      }
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

    const cueOrder = cues.map((c) => c.id);
    const cueTextById = new Map(cues.map((c) => [c.id, c.text]));
    const cueTermMatches = new Map<number, Array<{ start: number; end: number; target?: string }>>();

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
            termMatches
              .filter((m) => start <= m.start && m.end <= end)
              .map((m) => ({ start: m.start - start, end: m.end - start, target: m.target }))
          );
        }
      }
    }

    const unitOrder = units.map((u) => u.id);
    const unitPosition = new Map(unitOrder.map((id, i) => [id, i]));

    const primarySuspects = new Set([...lengthSuspects, ...cueSuspects]);
    const allSuspects = new Set(primarySuspects);
    for (const uid of bleedVictims) {
      if (unitById.has(uid) && !primarySuspects.has(uid)) {
        allSuspects.add(uid);
        log(`unit ${uid}: preceded a unit whose own marker went missing, adding to retry as a precaution against bleed-through`);
      }
    }
    for (const uid of cueSuspects) {
      const pos = unitPosition.get(uid);
      if (pos === undefined || pos === 0) continue;
      const precedingId = unitOrder[pos - 1]!;
      if (!primarySuspects.has(precedingId)) {
        allSuspects.add(precedingId);
        log(`unit ${precedingId}: adjacent to corrupt-marker unit ${uid}, adding to retry as a precaution against bleed-through`);
      }
    }

    for (const uid of Array.from(allSuspects).sort((a, b) => a - b)) {
      const recovered = await retryWindowed(units, uid, currentSourceLang, targetLang, batchChars, userAgent, safeMicrosoftApi);
      if (Object.keys(recovered).length > 0) {
        log(`windowed retry around unit ${uid}: recovered [${Object.keys(recovered).join(",")}]`);
        Object.assign(cumulativeTranslations, recovered);
      }

      const unit = unitById.get(uid);
      if (!unit) continue;
      let currentText = cumulativeTranslations[String(uid)] || "";
      let remaining = missingCueIds(unit, currentText);
      if (remaining.length === 0) continue;

      const trivial = remaining.filter(
        (cid) => !hasTranslatableContent(cueTextById.get(cid) || "", cueTermMatches.get(cid) || [])
      );
      if (trivial.length > 0) {
        const filled: Record<number, string> = {};
        for (const cid of trivial) filled[cid] = cueTextById.get(cid) || "";
        currentText = patchMissingCues(currentText, expectedCueIds(unit), filled);
        cumulativeTranslations[String(uid)] = currentText;
        remaining = remaining.filter((cid) => !trivial.includes(cid));
      }
      if (remaining.length === 0) continue;

      const recoveredCues = await retryIsolatedCues(
        remaining,
        cueOrder,
        cueTextById,
        cueTermMatches,
        currentSourceLang,
        targetLang,
        batchChars,
        userAgent,
        safeMicrosoftApi
      );
      if (Object.keys(recoveredCues).length > 0) {
        cumulativeTranslations[String(uid)] = patchMissingCues(currentText, expectedCueIds(unit), recoveredCues);
        log(`isolated cue retry for unit ${uid}: recovered cues [${Object.keys(recoveredCues).join(",")}]`);
      }
    }

    const cleanedTranslations: Record<string, string> = {};
    for (const [k, v] of Object.entries(cumulativeTranslations)) {
      if (typeof v === "string" && v.trim().length > 0) {
        cleanedTranslations[k] = v.trim();
      }
    }

    merger.updateSourceLang(currentSourceLang);
    merger.ingest(cleanedTranslations);
    const finalMerged = merger.snapshot(log);
    const finalDeltaCues = finalMerged.cues.filter((c) => c.translation !== null && !emittedCueIds.has(c.id));
    for (const c of finalDeltaCues) emittedCueIds.add(c.id);

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
