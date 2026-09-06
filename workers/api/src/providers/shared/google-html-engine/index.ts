import { remainingBudgetMs } from '../../../config/env';
import { Transport } from "./types";
import { Unit, Chapter, Cue } from "../../../core/types";
import { languageProfile } from "../../../core/languageProfiles";
import { coreLog } from "../../../core/log";
import { escapeRegExp } from "../../../core/srtExtract";
import { repairCorruptMarkers, CORRUPT_MARKER_SIGNATURE, hasMarkerLeak, sanitizeMarkersAgainstSource } from "../markerRepair";
import { reserveInitialDispatch } from "../dispatchReserve";
import { CUE_MARKER_PATTERN, cueMarkerTag, compareMarkerIds } from "../../../core/cueMarker";

const GROUP_MARKER_PATTERN = /\u27e6g([^\u27e6\u27e7]+)\u27e7/gi;
const groupMarker = (id: number | string) => `\u27e6g${id}\u27e7`;
const CUE_MARKER_TEMPLATE = cueMarkerTag;
const UNIT_MARKER_TEMPLATE = (id: number) => `\u27e6u${id}\u27e7`;
const UNIT_MARKER_PATTERN = /\u27e6u([^\u27e6\u27e7]+)\u27e7/gi;
const WINDOW_RADIUS_LADDER = [5, 3, 1, 0];
const ISOLATED_RADIUS_LADDER = [5, 3, 1, 0];
const TAG_PATTERN = /<[^>]+>/g;
const CONTENT_CHAR_PATTERN = /[\p{L}\p{N}_]/u;

const STYLE_TAG_PATTERN = /<\/?(i|b|u)>/gi;
const STYLE_TAG_TEST_PATTERN = /<\/?(i|b|u)>/i;
const STYLE_TAG_PLACEHOLDER = (index: number) => `\u0001${index}\u0001`;
const STYLE_TAG_PLACEHOLDER_PATTERN = /\u0001(\d+)\u0001/g;
const NO_TRANSLATE_OPEN = "\u2045";
const NO_TRANSLATE_CLOSE = "\u2046";
const NO_TRANSLATE_SENTINEL_PATTERN = /\u2045([\s\S]*?)\u2046/g;

const BATCH_PACK_RATIO = 0.9;
const INDEX_DIGITS_ESTIMATE = 4;
const SPAN_MARKUP_OVERHEAD = "<span id=></span>".length + INDEX_DIGITS_ESTIMATE + groupMarker("0".repeat(INDEX_DIGITS_ESTIMATE)).length + 2;
const CHAPTER_WRAPPER_OVERHEAD = "<div></div>".length;
const BATCH_FANOUT_CONCURRENCY = 6;

function escapedLength(text: string): number {
  let extra = 0;
  for (const ch of text) {
    if (ch === "&") extra += 4;
    else if (ch === "<" || ch === ">") extra += 3;
  }
  return text.length + extra;
}

function itemMarkupChars(item: Item): number {
  return SPAN_MARKUP_OVERHEAD + escapedLength(item.text);
}

const LENGTH_RATIO_MIN = 0.15;
const LENGTH_RATIO_MAX = 6.0;

type WordScript = "latin" | "cyrillic" | "arabic" | "devanagari" | "hebrew" | "greek";
const WORD_BASED_SCRIPTS = new Set<WordScript>(["latin", "cyrillic", "arabic", "devanagari", "hebrew", "greek"]);
const SCRIPT_CHAR_RANGES: Record<string, string> = {
  latin: "A-Za-z", cyrillic: "\u0400-\u04ff", arabic: "\u0600-\u06ff", devanagari: "\u0900-\u097f",
  hebrew: "\u0590-\u05ff", greek: "\u0370-\u03ff", cjk: "\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af", thai: "\u0e00-\u0e7f",
};
const SCRIPT_LEAK_PATTERNS: Record<string, RegExp> = Object.fromEntries(
  Object.entries(SCRIPT_CHAR_RANGES).map(([name, chars]) => [
    name,
    new RegExp(WORD_BASED_SCRIPTS.has(name as WordScript) ? `[${chars}]{2,}` : `[${chars}]`),
  ])
);
const SCRIPT_LEAK_PATTERNS_GLOBAL: Record<string, RegExp> = Object.fromEntries(
  Object.entries(SCRIPT_LEAK_PATTERNS).map(([name, pattern]) => [name, new RegExp(pattern.source, "g")])
);
const LANGUAGE_SCRIPTS: Record<string, string> = {
  en: "latin", es: "latin", fr: "latin", de: "latin", it: "latin", pt: "latin", nl: "latin", pl: "latin",
  sv: "latin", da: "latin", no: "latin", fi: "latin", ro: "latin", cs: "latin", hu: "latin", tr: "latin",
  id: "latin", vi: "latin", ms: "latin", tl: "latin", ca: "latin", eu: "latin", gl: "latin", la: "latin",
  zh: "cjk", ja: "cjk", ko: "cjk", ru: "cyrillic", uk: "cyrillic", bg: "cyrillic",
  ar: "arabic", fa: "arabic", ur: "arabic", hi: "devanagari", ne: "devanagari", mr: "devanagari",
  th: "thai", he: "hebrew", el: "greek",
};



const MAX_CONTEXT_CHARS = 500;
const CONTEXT_PROBE_SAMPLE_CHARS = 200;

export interface LangResolver {
  note(detected: string | null): void;
  log(message: string): void;
}

function createLangResolver(onLog?: (message: string) => void): LangResolver & { value: string | null } {
  return {
    value: null as string | null,
    note(this: { value: string | null }, detected: string | null) {
      if (!this.value && detected) this.value = detected;
    },
    log(message: string) {
      onLog?.(message);
    },
  };
}

const MAX_BATCH_ATTEMPTS = 3;
const BATCH_RETRY_DELAY_MS = 3000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeSourceLanguage(transport: Transport, cues: Cue[], targetLang: string, startedAt: number, clientUserAgent?: string, onLog?: (msg: string) => void): Promise<string | null> {
  const sample = cues.map((c) => c.text).join(" ").trim().slice(0, CONTEXT_PROBE_SAMPLE_CHARS);
  if (!sample) return null;
  try {
    const upstream = await transport.send(escapeHtml(sample), "auto", targetLang, clientUserAgent, AbortSignal.timeout(remainingBudgetMs(startedAt)));
    return upstream.detectedLang;
  } catch (e) {
    onLog?.(`context: source-language probe failed, falling back to auto: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export interface ContextResolution {
  sourceLang: string;
  contextText: string | undefined;
}

export async function resolveContext(
  transport: Transport, contextText: string | undefined, needsTranslation: boolean | undefined,
  sourceLang: string, targetLang: string, cues: Cue[], maxChars: number, startedAt: number, clientUserAgent?: string, onLog?: (message: string) => void
): Promise<ContextResolution> {
  if (!contextText) return { sourceLang, contextText: undefined };

  let resolvedSourceLang = sourceLang;
  let resolvedContext = contextText;

  if (needsTranslation) {
    if (resolvedSourceLang === "auto") {
      onLog?.("context: subtitle source language unknown, sampling a probe translation to resolve it first");
      resolvedSourceLang = (await probeSourceLanguage(transport, cues, targetLang, startedAt, clientUserAgent, onLog)) || resolvedSourceLang;
    }
    if (resolvedSourceLang !== "auto") {
      onLog?.(`context: translating supplied context into ${resolvedSourceLang} to match the subtitle`);
      try {
        const upstream = await transport.send(escapeHtml(contextText), "auto", resolvedSourceLang, clientUserAgent, AbortSignal.timeout(remainingBudgetMs(startedAt)));
        resolvedContext = unescapeHtml(upstream.translatedHtml);
      } catch (e) {
        onLog?.("context: translation failed, using the original text as-is");
        onLog?.(`context translation failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const cap = Math.min(MAX_CONTEXT_CHARS, maxChars);
  if (resolvedContext.length > cap) resolvedContext = resolvedContext.slice(0, cap);
  return { sourceLang: resolvedSourceLang, contextText: resolvedContext };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeHtml(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function escapeHtmlPreservingStyle(text: string): string {
  let result = "";
  let cursor = 0;
  for (const m of text.matchAll(STYLE_TAG_PATTERN)) {
    result += escapeHtml(text.slice(cursor, m.index)) + m[0].toLowerCase();
    cursor = m.index! + m[0].length;
  }
  return result + escapeHtml(text.slice(cursor));
}

function cleanTranslatedFragment(raw: string): string {
  const preserved: string[] = [];
  const guarded = raw.replace(STYLE_TAG_PATTERN, (tag) => {
    preserved.push(tag.toLowerCase());
    return STYLE_TAG_PLACEHOLDER(preserved.length - 1);
  });
  const restored = guarded.replace(TAG_PATTERN, "").replace(STYLE_TAG_PLACEHOLDER_PATTERN, (_, i) => preserved[Number(i)]);
  return unescapeHtml(restored).trim();
}

function hasContent(text: string | null | undefined): boolean {
  return Boolean(text) && CONTENT_CHAR_PATTERN.test(text as string);
}

interface Item {
  id: string;
  text: string;
}

function splitOversizedChapter(items: Item[], batchChars: number) {
  const pieces: Item[][] = [];
  const oversized: Item[] = [];
  let piece: Item[] = [];
  let pieceChars = CHAPTER_WRAPPER_OVERHEAD;
  for (const item of items) {
    const itemChars = itemMarkupChars(item);
    if (itemChars > batchChars) {
      oversized.push(item);
      continue;
    }
    if (piece.length && pieceChars + itemChars > batchChars) {
      pieces.push(piece);
      piece = [];
      pieceChars = CHAPTER_WRAPPER_OVERHEAD;
    }
    piece.push(item);
    pieceChars += itemChars;
  }
  if (piece.length) pieces.push(piece);
  return { pieces, oversized };
}

function buildBatches(items: Item[], chapterGroups: string[][], batchChars: number) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const batches: Item[][][] = [];
  const oversized: Item[] = [];
  let current: Item[][] = [];
  let currentChars = 0;
  const flush = () => {
    if (current.length) batches.push(current);
    current = [];
    currentChars = 0;
  };
  for (const group of chapterGroups) {
    const groupItems = group.map((id) => byId.get(id)).filter((x): x is Item => Boolean(x));
    if (!groupItems.length) continue;
    const groupChars = CHAPTER_WRAPPER_OVERHEAD + groupItems.reduce((s, i) => s + itemMarkupChars(i), 0);
    if (groupChars > batchChars) {
      flush();
      const { pieces, oversized: groupOversized } = splitOversizedChapter(groupItems, batchChars);
      for (const piece of pieces) batches.push([piece]);
      oversized.push(...groupOversized);
    } else if (currentChars + groupChars > batchChars) {
      flush();
      current = [groupItems];
      currentChars = groupChars;
    } else {
      current.push(groupItems);
      currentChars += groupChars;
    }
  }
  flush();
  return { batches, oversized };
}

function buildChapterHtml(group: Item[], indices: Map<string, number>, contextText?: string): string {
  const spans = group
    .map((item) => {
      const idx = indices.get(item.id)!;
      return `<span id=${idx}>${groupMarker(idx)}${escapeHtmlPreservingStyle(item.text)}</span>`;
    })
    .join("");
  const context = contextText ? `<span>${groupMarker("ctx")}${escapeHtml(contextText)}</span>` : "";
  return `<div>${context}${spans}</div>`;
}

function splitByMarker(flatText: string, pattern: RegExp): Map<string, string> {
  const parts = flatText.split(pattern);
  const result = new Map<string, string>();
  const seen = new Set<string>();
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i];
    if (seen.has(key)) {
      result.delete(key);
      continue;
    }
    seen.add(key);
    const text = (parts[i + 1] || "").trim();
    if (text) result.set(key, text);
  }
  return result;
}

const SPAN_OPEN_PATTERN = /<span[^>]*\bid=["']?([a-zA-Z0-9:]+)["']?[^>]*>/gi;

function extractFirstMarkerAnchors(html: string, expectedIds?: Set<number>): [number, number, number][] {
  const firstMarkers = new Map<number, [number, number, number]>();
  for (const m of html.matchAll(SPAN_OPEN_PATTERN)) {
    if (/^\d+$/.test(m[1])) {
      const idx = Number(m[1]);
      if (!expectedIds || expectedIds.has(idx)) {
        if (!firstMarkers.has(idx) || m.index! < firstMarkers.get(idx)![0]) {
          firstMarkers.set(idx, [m.index!, m.index! + m[0].length, idx]);
        }
      }
    }
  }
  for (const m of html.matchAll(GROUP_MARKER_PATTERN)) {
    if (/^\d+$/.test(m[1])) {
      const idx = Number(m[1]);
      if (!expectedIds || expectedIds.has(idx)) {
        if (!firstMarkers.has(idx) || m.index! < firstMarkers.get(idx)![0]) {
          firstMarkers.set(idx, [m.index!, m.index! + m[0].length, idx]);
        }
      }
    }
  }
  return Array.from(firstMarkers.values()).sort((a, b) => a[0] - b[0]);
}

function parseByReconciledBoundaries(
  html: string,
  boundaries: [number, number, number][],
  sourceByIndex?: Map<number, string>
): Map<number, string> {
  const result = new Map<number, string>();
  for (let i = 0; i < boundaries.length; i++) {
    const [start, end, idx] = boundaries[i];
    const nextBoundary = i + 1 < boundaries.length ? boundaries[i + 1][0] : html.length;
    const raw = nextBoundary < end ? "" : html.slice(end, nextBoundary);
    let text = cleanTranslatedFragment(raw);
    const sourceText = sourceByIndex?.get(idx) || "";
    text = sanitizeMarkersAgainstSource(text, sourceText);
    if (!text && !(sourceText && !hasContent(sourceText))) {
      continue;
    }
    result.set(idx, text);
  }
  return result;
}

function parseTranslatedHtml(
  html: string,
  expectedIds?: number[],
  sourceByIndex?: Map<number, string>
): Map<number, string> {
  let flat = html;
  if (expectedIds && expectedIds.length > 0) {
    flat = repairCorruptMarkers(flat, "g", expectedIds);
  }
  const boundaries = extractFirstMarkerAnchors(flat, expectedIds ? new Set(expectedIds) : undefined);
  return parseByReconciledBoundaries(flat, boundaries, sourceByIndex);
}

async function sendHtml(transport: Transport, html: string, sourceLang: string, targetLang: string, signal?: AbortSignal, resolver?: LangResolver, clientUserAgent?: string): Promise<string> {
  const upstream = await transport.send(html, sourceLang, targetLang, clientUserAgent, signal ?? new AbortController().signal);
  resolver?.note(upstream.detectedLang);
  return upstream.translatedHtml;
}

function prepareBatch(batch: Item[][], contextText?: string): { items: Item[]; idByIndex: Map<number, string>; html: string; batch: Item[][]; indices: Map<string, number> } {
  const items = batch.flat();
  const indices = new Map(items.map((item, i) => [item.id, i + 1]));
  const idByIndex = new Map(Array.from(indices, ([id, i]) => [i, id]));
  const html = batch.map((group) => buildChapterHtml(group, indices, contextText)).join("");
  return { items, idByIndex, html, batch, indices };
}

function extractTranslations(translatedHtml: string, items: Item[], idByIndex: Map<number, string>): Map<string, string> {
  const sourceById = new Map(items.map((item) => [item.id, item.text]));
  const sourceByIndex = new Map<number, string>();
  for (const [idx, itemId] of idByIndex) {
    sourceByIndex.set(idx, sourceById.get(itemId) || "");
  }
  const expectedIds = Array.from(idByIndex.keys());
  const parsed = parseTranslatedHtml(translatedHtml, expectedIds, sourceByIndex);
  const result = new Map<string, string>();
  for (const [idx, text] of parsed) {
    const itemId = idByIndex.get(idx);
    if (itemId === undefined) continue;
    if (hasContent(text) || !hasContent(sourceById.get(itemId))) result.set(itemId, text);
  }
  return result;
}

interface SendBatchesOptions {
  resolver?: LangResolver;
  contextText?: string;
  clientUserAgent?: string;
  onChunk?: (translations: Map<string, string>) => void;
}

function activateNoTranslateSpans(html: string): string {
  return html.replace(NO_TRANSLATE_SENTINEL_PATTERN, '<span translate="no">$1</span>');
}

async function sendBatchWithRetry(
  transport: Transport, prepared: { items: Item[]; idByIndex: Map<number, string>; html: string; batch: Item[][]; indices: Map<string, number> },
  sourceLang: string, targetLang: string, signal: AbortSignal, clientUserAgent: string | undefined, resolver: LangResolver | undefined,
  batchLabel: string
): Promise<Map<string, string>> {
  const { items, idByIndex } = prepared;
  let chunkTranslations = new Map<string, string>();
  let plainHtml: string | null = null;

  for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
    if (attempt > 1 && plainHtml === null) {
      plainHtml = prepared.batch.map((group) => buildChapterHtml(group, prepared.indices, undefined)).join("");
    }
    const html = attempt === 1 ? prepared.html : plainHtml!;
    try {
      const translatedHtml = await sendHtml(transport, activateNoTranslateSpans(html), sourceLang, targetLang, signal, resolver, clientUserAgent);
      chunkTranslations = extractTranslations(translatedHtml, items, idByIndex);
    } catch (e) {
      resolver?.log(`${batchLabel} attempt ${attempt}: request failed: ${e instanceof Error ? e.message : String(e)}`);
      chunkTranslations = new Map();
    }

    const missing = items.length - chunkTranslations.size;
    if (missing <= 0) break;
    resolver?.log(`${batchLabel} attempt ${attempt}: missing ${missing} of ${items.length} unit(s)`);
    if (attempt < MAX_BATCH_ATTEMPTS && !transport.isExhausted) await delay(BATCH_RETRY_DELAY_MS);
  }

  return chunkTranslations;
}

async function sendBatches(
  transport: Transport, batches: Item[][][], sourceLang: string, targetLang: string, budgetMs: number, options: SendBatchesOptions = {}
): Promise<Map<string, string>> {
  if (!batches.length) return new Map();
  const { resolver, contextText, clientUserAgent, onChunk } = options;
  const prepared = batches.map((batch) => prepareBatch(batch, contextText));
  const translations = new Map<string, string>();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < prepared.length) {
      const i = cursor++;
      const chunkTranslations = await sendBatchWithRetry(
        transport, prepared[i], sourceLang, targetLang, controller.signal, clientUserAgent, resolver, `batch ${i + 1}/${prepared.length}`
      );
      if (chunkTranslations.size === 0) {
        resolver?.log(`batch ${i + 1}/${prepared.length}: no result from upstream, will retry missing units individually`);
        continue;
      }
      for (const [id, text] of chunkTranslations) translations.set(id, text);
      if (onChunk) onChunk(chunkTranslations);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(BATCH_FANOUT_CONCURRENCY, prepared.length) }, runWorker));
  } finally {
    clearTimeout(timer);
  }

  return translations;
}

interface TranslateOptions {
  maxChars: number;
  startedAt: number;
  resolver: LangResolver;
  contextText?: string;
  cueIdsById?: Map<string, number[]>;
  clientUserAgent?: string;
  onChunk?: (translations: Map<string, string>) => void;
  subrequestLimit?: number;
}

async function translate(
  transport: Transport, items: Item[], chapterGroups: string[][], sourceLang: string, targetLang: string, options: TranslateOptions
): Promise<{ translations: Map<string, string>; skipped: string[] }> {
  const { maxChars, startedAt, resolver, contextText, cueIdsById, clientUserAgent, onChunk, subrequestLimit } = options;
  const { batches, oversized } = buildBatches(items, chapterGroups, maxChars);
  for (const item of oversized) resolver.log(`${describeIds([item.id], cueIdsById || new Map())}: ${item.text.length} chars exceeds maxChars (${maxChars}), cue-level content cannot be split further, skipping without truncation`);
  const dispatchBatches = subrequestLimit
    ? reserveInitialDispatch(batches, subrequestLimit, (kept, total) => resolver.log(`Limiting initial dispatch to ${kept} batch(es) (was ${total}) to reserve room for recovery passes.`))
    : batches;
  const translations = await sendBatches(transport, dispatchBatches, sourceLang, targetLang, remainingBudgetMs(startedAt), { resolver, contextText, clientUserAgent, onChunk });
  const oversizedIds = new Set(oversized.map((i) => i.id));
  const missing = items.map((i) => i.id).filter((id) => !translations.has(id) && !oversizedIds.has(id));
  return { translations, skipped: [...oversized.map((i) => i.id), ...missing] };
}

function scriptOf(lang: string | undefined | null): string | undefined {
  return LANGUAGE_SCRIPTS[(lang || "").split("-")[0].toLowerCase()];
}

const STYLE_AND_TAG_STRIP_PATTERN = /\{\\[^}]*\}|<[^>]*>|\u27e6[^\u27e6\u27e7]*\u27e7/g;
const UNTRANSLATED_WORD_PAIR_THRESHOLD = 2;

export function isUntranslated(text: string, sourceLang: string, targetLang: string): boolean {
  if (!text) return false;
  const sourceScript = scriptOf(sourceLang);
  const targetScript = scriptOf(targetLang);
  if (!sourceScript || !targetScript || sourceScript === targetScript) return false;

  const clean = text.replace(STYLE_AND_TAG_STRIP_PATTERN, "").trim();
  if (!clean) return false;

  const pattern = SCRIPT_LEAK_PATTERNS_GLOBAL[sourceScript];
  if (!pattern) return false;
  const leaked = clean.match(pattern) || [];
  const threshold = WORD_BASED_SCRIPTS.has(sourceScript as WordScript) && WORD_BASED_SCRIPTS.has(targetScript as WordScript)
    ? UNTRANSLATED_WORD_PAIR_THRESHOLD
    : 0;
  return leaked.length > threshold;
}

interface TermMatch {
  start: number;
  end: number;
  source: string;
  target: string;
}

interface TermGroup {
  start: number;
  end: number;
  literal: string;
  replacement: string;
}

function buildTermGroups(text: string, termMatches: TermMatch[]): TermGroup[] {
  const groups: TermGroup[] = [];
  let i = 0;
  while (i < termMatches.length) {
    let j = i;
    let groupEnd = termMatches[i].end;
    while (j + 1 < termMatches.length && /^\s*$/.test(text.slice(groupEnd, termMatches[j + 1].start))) {
      j += 1;
      groupEnd = termMatches[j].end;
    }
    const groupStart = termMatches[i].start;
    let replacement = "";
    let cursor = groupStart;
    for (let k = i; k <= j; k++) {
      replacement += text.slice(cursor, termMatches[k].start) + termMatches[k].target;
      cursor = termMatches[k].end;
    }
    replacement += text.slice(cursor, groupEnd);
    groups.push({ start: groupStart, end: groupEnd, literal: text.slice(groupStart, groupEnd), replacement });
    i = j + 1;
  }
  return groups;
}

function wrapTermGroups(text: string, groups: TermGroup[]): string {
  if (!groups.length) return text;
  const pieces: string[] = [];
  let cursor = 0;
  for (const g of groups) {
    pieces.push(text.slice(cursor, g.start), NO_TRANSLATE_OPEN, g.literal, NO_TRANSLATE_CLOSE);
    cursor = g.end;
  }
  pieces.push(text.slice(cursor));
  return pieces.join("");
}

function applyTermSubstitution(translated: string, groups: TermGroup[], collapseSurroundingWhitespace: boolean): string {
  let result = translated;
  for (const g of groups) {
    if (!result.includes(g.literal)) continue;
    const pattern = collapseSurroundingWhitespace
      ? new RegExp(`\\s*${escapeRegExp(g.literal)}\\s*`)
      : new RegExp(escapeRegExp(g.literal));
    result = result.replace(pattern, g.replacement);
  }
  return result;
}

const STYLE_DANGLING_OPEN_PATTERN = /<(i|b|u)(?![a-zA-Z>])/gi;
const STYLE_MISSING_OPEN_BRACKET_PATTERN = /(?<!<)\/(i|b|u)>/gi;

function repairStyleTags(text: string): string {
  const withClosed = text.replace(STYLE_DANGLING_OPEN_PATTERN, (_, tag) => `</${tag.toLowerCase()}>`);
  return withClosed.replace(STYLE_MISSING_OPEN_BRACKET_PATTERN, (_, tag) => `</${tag.toLowerCase()}>`);
}

function styleTagsBalanced(text: string): boolean {
  const depth: Record<string, number> = { i: 0, b: 0, u: 0 };
  for (const m of text.matchAll(STYLE_TAG_PATTERN)) {
    const token = m[0].toLowerCase();
    const tag = token.replace(/[</>]/g, "");
    depth[tag] += token[1] === "/" ? -1 : 1;
    if (depth[tag] < 0) return false;
  }
  return Object.values(depth).every((v) => v === 0);
}

function stripStyleTags(text: string): string {
  return text.replace(STYLE_TAG_PATTERN, "");
}

function sanitizeStyleTags(text: string): string {
  if (!STYLE_TAG_TEST_PATTERN.test(text)) return text;
  const repaired = repairStyleTags(text);
  return styleTagsBalanced(repaired) ? repaired : stripStyleTags(repaired);
}

function flattenUnits(units: Unit[], chapterOfUnit: Map<number, number>) {
  const items: Item[] = [];
  const chapterItems = new Map<number | undefined, string[]>();
  const cueIdsById = new Map<string, number[]>();
  for (const unit of units) {
    const chapterId = chapterOfUnit.get(unit.id);
    const groups = buildTermGroups(unit.text, unit.term_matches);
    const itemId = String(unit.id);
    items.push({ id: itemId, text: wrapTermGroups(unit.text, groups) });
    if (!chapterItems.has(chapterId)) chapterItems.set(chapterId, []);
    chapterItems.get(chapterId)!.push(itemId);
    cueIdsById.set(itemId, unit.spans.map((s) => s.id));
  }
  return { items, chapterGroups: [...chapterItems.values()], cueIdsById };
}

function describeIds(ids: string[], cueIdsById: Map<string, number[]>): string {
  return ids.map((id) => {
    const cues = cueIdsById.get(id);
    return cues ? `cues ${JSON.stringify(cues)}` : id;
  }).join("; ");
}

function resolveTranslation(unit: Unit, translations: Map<string, string>, targetLang: string, resolver?: LangResolver): [string | null, string | null] {
  const result = translations.get(String(unit.id));
  if (result === undefined) return [null, null];
  const groups = buildTermGroups(unit.text, unit.term_matches);
  const collapseWhitespace = languageProfile(targetLang).script === "cjk";
  let resolved = groups.length ? applyTermSubstitution(result, groups, collapseWhitespace) : result;
  const sanitized = sanitizeStyleTags(resolved);
  if (sanitized !== resolved && !STYLE_TAG_TEST_PATTERN.test(sanitized)) {
    resolver?.log(`cues ${JSON.stringify(unit.spans.map((s) => s.id))}: inline style tags unrepairable or unbalanced after translation, stripping to avoid broken markup`);
  }
  resolved = sanitized;
  return [resolved, wrapTermGroups(unit.text, groups)];
}

function contentLength(text: string | null | undefined): number {
  return (text || "").match(/[\p{L}\p{N}_]/gu)?.length || 0;
}

export function isLengthPlausible(sourceText: string, translatedText: string): boolean {
  const sourceLen = contentLength(sourceText);
  if (sourceLen === 0) return true;
  const ratio = contentLength(translatedText) / sourceLen;
  return ratio >= LENGTH_RATIO_MIN && ratio <= LENGTH_RATIO_MAX;
}

const STYLE_TAG_STRIP_PATTERN = /<\/?(?:i|b|u)>/gi;

function normalizeForEquality(text: string): string {
  return (text || "").replace(STYLE_TAG_STRIP_PATTERN, "").replace(/[\s\p{P}\p{N}\u2669\u266A\u266B\u266C]/gu, "");
}

function wordCount(text: string): number {
  return (text || "").replace(STYLE_TAG_STRIP_PATTERN, "").match(/[\p{L}\p{N}_]+/gu)?.length || 0;
}

export function isLeakedUntranslated(original: string, translated: string, sourceLang: string, targetLang: string): boolean {
  if (!translated) return false;
  const normOrig = normalizeForEquality(original);
  if (!normOrig) return false;

  const sl = scriptOf(sourceLang);
  const tl = scriptOf(targetLang);
  if (sl === "latin" && tl === "cjk") {
    // skip
  } else if (sl === "cjk" && tl === "latin") {
    // skip
  } else {
    if (wordCount(original) < 2) return false;
  }
  return normOrig === normalizeForEquality(translated);
}

function unitCueIds(unit: Unit): number[] {
  return unit.spans.map((s) => s.id);
}

function isSinglePlainCue(unit: Unit): boolean {
  return unitCueIds(unit).length === 1 && expectedCueIds(unit).length === 0;
}

function findLeakedCueIds(unit: Unit, text: string, sourceLang: string, targetLang: string): string[] {
  const markerIds = expectedCueIds(unit);
  if (markerIds.length > 0) {
    const chunks = splitCueChunks(text);
    const spanText = new Map(unit.spans.filter((s) => s.boundary === "marker").map((s) => [s.marker_id, s.text]));
    return markerIds.filter((cid) => chunks.has(cid) && isLeakedUntranslated(spanText.get(cid) || "", chunks.get(cid)!, sourceLang, targetLang));
  }
  const ids = unitCueIds(unit);
  return ids.length === 1 && isLeakedUntranslated(unit.text, text, sourceLang, targetLang) ? [String(ids[0])] : [];
}

const PLAIN_DIV_PATTERN = /<div[^>]*>([\s\S]*?)<\/div>/g;

function parsePlainDivs(html: string): string[] {
  const result: string[] = [];
  for (const m of html.matchAll(PLAIN_DIV_PATTERN)) {
    const raw = cleanTranslatedFragment(m[1]);
    result.push(raw.replace(/\s+/g, " "));
  }
  return result;
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

async function resolveChunkWithBinaryFallback(
  indices: number[], payloads: string[], transport: Transport, sourceLang: string, targetLang: string, clientUserAgent?: string, signal?: AbortSignal, resolver?: LangResolver
): Promise<Map<number, string>> {
  if (indices.length === 0 || transport.isExhausted) return new Map();
  const chunkHtml = indices.map((i) => payloads[i]).join("");
  try {
    const translatedHtml = await sendHtml(transport, chunkHtml, sourceLang, targetLang, signal, resolver, clientUserAgent);
    const divs = parsePlainDivs(translatedHtml);
    if (divs.length === indices.length) {
      const recovered = new Map<number, string>();
      for (let k = 0; k < indices.length; k++) recovered.set(indices[k], divs[k]);
      return recovered;
    }
    if (indices.length === 1) {
      const divVal = divs.length > 0 ? divs[0] : cleanTranslatedFragment(translatedHtml).replace(/\s+/g, " ");
      const recovered = new Map<number, string>();
      if (divVal) recovered.set(indices[0], divVal);
      return recovered;
    }
  } catch (e: any) {
    resolver?.log(`packed jobs chunk failed: ${e?.message || e}`);
    if (indices.length === 1) return new Map();
  }

  const mid = Math.floor(indices.length / 2);
  const recovered = new Map<number, string>();
  const [left, right] = await Promise.all([
    resolveChunkWithBinaryFallback(indices.slice(0, mid), payloads, transport, sourceLang, targetLang, clientUserAgent, signal, resolver),
    resolveChunkWithBinaryFallback(indices.slice(mid), payloads, transport, sourceLang, targetLang, clientUserAgent, signal, resolver),
  ]);
  for (const [k, v] of left) recovered.set(k, v);
  for (const [k, v] of right) recovered.set(k, v);
  return recovered;
}

async function runPackedJobs(
  payloads: string[], maxCharsPerRequest: number, transport: Transport, sourceLang: string, targetLang: string, budgetMs: number, clientUserAgent?: string, resolver?: LangResolver
): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(payloads.length).fill(null);
  if (payloads.length === 0) return results;
  const chunks = packByChars(payloads, maxCharsPerRequest);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  let cursor = 0;
  const runWorker = async () => {
    while (cursor < chunks.length && !transport.isExhausted) {
      const indices = chunks[cursor++];
      const chunkRecovered = await resolveChunkWithBinaryFallback(indices, payloads, transport, sourceLang, targetLang, clientUserAgent, controller.signal, resolver);
      for (const [i, text] of chunkRecovered) results[i] = text;
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(BATCH_FANOUT_CONCURRENCY, chunks.length) }, runWorker));
  } finally {
    clearTimeout(timer);
  }
  return results;
}

async function runPackedJobsWithLookahead(
  primary: Map<number, string>, speculative: Map<number, string>, maxCharsPerRequest: number,
  transport: Transport, sourceLang: string, targetLang: string, budgetMs: number, clientUserAgent?: string, resolver?: LangResolver
): Promise<{ primaryResults: Map<number, string>; speculativeResults: Map<number, string> }> {
  const primaryResults = new Map<number, string>();
  const speculativeResults = new Map<number, string>();
  const suspectIds = [...primary.keys()];
  if (suspectIds.length === 0) return { primaryResults, speculativeResults };

  const chunks = packByChars(suspectIds.map((id) => primary.get(id)!), maxCharsPerRequest);
  const usedSpeculative = new Set<number>();
  const speculativeEntries = [...speculative];
  let borrowCursor = 0;
  const attachedPerChunk: number[][] = chunks.map((chunkIdxList) => {
    let used = chunkIdxList.reduce((sum, idx) => sum + primary.get(suspectIds[idx]!)!.length, 0);
    const attached: number[] = [];
    const ownIds = chunkIdxList.map((idx) => suspectIds[idx]!);
    for (const id of ownIds) {
      const spec = speculative.get(id);
      if (spec === undefined || usedSpeculative.has(id) || used + spec.length > maxCharsPerRequest) continue;
      attached.push(id);
      usedSpeculative.add(id);
      used += spec.length;
    }
    while (borrowCursor < speculativeEntries.length) {
      const [id, spec] = speculativeEntries[borrowCursor]!;
      if (usedSpeculative.has(id)) {
        borrowCursor++;
        continue;
      }
      if (used + spec.length > maxCharsPerRequest) break;
      attached.push(id);
      usedSpeculative.add(id);
      used += spec.length;
      borrowCursor++;
    }
    return attached;
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  let cursor = 0;
  const runWorker = async () => {
    while (cursor < chunks.length && !transport.isExhausted) {
      const ci = cursor++;
      const items: { id: number; kind: "primary" | "speculative"; payload: string }[] = [
        ...chunks[ci]!.map((idx) => ({ id: suspectIds[idx]!, kind: "primary" as const, payload: primary.get(suspectIds[idx]!)! })),
        ...attachedPerChunk[ci]!.map((id) => ({ id, kind: "speculative" as const, payload: speculative.get(id)! })),
      ];
      const recovered = await resolveChunkWithBinaryFallback(items.map((_, i) => i), items.map((it) => it.payload), transport, sourceLang, targetLang, clientUserAgent, controller.signal, resolver);
      for (const [i, text] of recovered) {
        const item = items[i]!;
        (item.kind === "primary" ? primaryResults : speculativeResults).set(item.id, text);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(BATCH_FANOUT_CONCURRENCY, chunks.length) }, runWorker));
  } finally {
    clearTimeout(timer);
  }
  return { primaryResults, speculativeResults };
}

function protectContentHtml(text: string, termMatches: TermMatch[]): string {
  const groups = buildTermGroups(text, termMatches);
  return wrapTermGroups(text, groups);
}

interface PlainEntry {
  id: number;
  payload: string;
  original: string;
  unit: Unit;
}

async function recoverPlainItems(
  entries: PlainEntry[], sourceLang: string, targetLang: string, requestCharBudget: number, transport: Transport, startedAt: number, resolver: LangResolver, clientUserAgent?: string
): Promise<Map<number, string>> {
  if (entries.length === 0) return new Map();
  const htmlResults = await runPackedJobs(entries.map((e) => e.payload), requestCharBudget, transport, sourceLang, targetLang, remainingBudgetMs(startedAt), clientUserAgent, resolver);
  const recovered = new Map<number, string>();
  const collapseWhitespace = languageProfile(targetLang).script === "cjk";
  entries.forEach((entry, i) => {
    let html = htmlResults[i];
    if (html === null) return;
    const expected = expectedCueIds(entry.unit);
    if (expected.length > 0) html = repairCorruptMarkers(html, "c", expected);
    const groups = buildTermGroups(entry.original, entry.unit.term_matches || []);
    const text = groups.length ? applyTermSubstitution(html, groups, collapseWhitespace) : html;
    if (text !== null && !CORRUPT_MARKER_SIGNATURE.test(text) && !isUntranslated(text, sourceLang, targetLang) && isLengthPlausible(entry.original, text)) {
      recovered.set(entry.id, text);
    }
  });
  return recovered;
}

interface WindowJob {
  suspectId: number;
  payload: string;
  windowIds: number[];
  isSolo: boolean;
}

function buildWindowJob(units: Unit[], indexOf: Map<number, number>, suspectId: number, radius: number, requestCharBudget: number): WindowJob | null {
  const index = indexOf.get(suspectId);
  if (index === undefined) return null;
  const window = units.slice(Math.max(0, index - radius), index + radius + 1);
  if (window.length < 1) return null;
  const isSolo = window.length === 1;
  const payload = isSolo
    ? `<div>${protectContentHtml(window[0].text, window[0].term_matches || [])}</div>`
    : `<div>${window.map((u) => `${UNIT_MARKER_TEMPLATE(u.id)}${protectContentHtml(u.text, u.term_matches || [])}`).join("")}</div>`;
  if (payload.length > requestCharBudget) return null;
  return { suspectId, payload, windowIds: window.map((u) => u.id), isSolo };
}

function validateWindowJob(job: WindowJob, html: string, radius: number, unitById: Map<number, Unit>, strictMarker: boolean): string | null {
  let markerRes = new Map<string, string>();
  if (job.isSolo) {
    markerRes.set(String(job.windowIds[0]), html);
  } else {
    const flat = repairCorruptMarkers(html, "u", job.windowIds);
    markerRes = splitByMarker(flat, UNIT_MARKER_PATTERN);
    if (!job.windowIds.every((id) => markerRes.has(String(id)))) return null;
  }
  if (strictMarker && radius > 0 && !markerRes.has(String(job.suspectId))) return null;
  const textRaw = markerRes.get(String(job.suspectId));
  if (textRaw === undefined) return null;
  const unit = unitById.get(job.suspectId);
  if (!unit) return null;
  let text = textRaw;
  const expected = expectedCueIds(unit);
  if (expected.length > 0) text = repairCorruptMarkers(text, "c", expected);
  if (!CORRUPT_MARKER_SIGNATURE.test(text) && (radius === 0 || isLengthPlausible(unit.text, text))) return text;
  return null;
}

async function retryWindowedAll(
  units: Unit[],
  suspectIds: number[],
  sourceLang: string,
  targetLang: string,
  requestCharBudget: number,
  transport: Transport,
  startedAt: number,
  resolver: LangResolver,
  clientUserAgent?: string,
  strictMarker: boolean = false
): Promise<Map<number, string>> {
  const recovered = new Map<number, string>();
  const indexOf = new Map(units.map((u, i) => [u.id, i]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  let pending = suspectIds.filter((id) => indexOf.has(id));
  const skipRadius = new Map<number, number>();

  for (let ladderIndex = 0; ladderIndex < WINDOW_RADIUS_LADDER.length; ladderIndex++) {
    const radius = WINDOW_RADIUS_LADDER[ladderIndex]!;
    if (pending.length === 0 || transport.isExhausted) break;
    const nextRadius = ladderIndex + 1 < WINDOW_RADIUS_LADDER.length ? WINDOW_RADIUS_LADDER[ladderIndex + 1]! : null;
    const activeSuspects = pending.filter((id) => skipRadius.get(id) !== radius);

    const jobs = new Map<number, WindowJob>();
    for (const suspectId of activeSuspects) {
      const job = buildWindowJob(units, indexOf, suspectId, radius, requestCharBudget);
      if (job) jobs.set(suspectId, job);
    }
    if (jobs.size === 0) continue;

    const speculativeJobs = new Map<number, WindowJob>();
    if (nextRadius !== null) {
      for (const suspectId of jobs.keys()) {
        const specJob = buildWindowJob(units, indexOf, suspectId, nextRadius, requestCharBudget);
        if (specJob) speculativeJobs.set(suspectId, specJob);
      }
    }

    const primaryPayloads = new Map([...jobs].map(([id, job]) => [id, job.payload]));
    const speculativePayloads = new Map([...speculativeJobs].map(([id, job]) => [id, job.payload]));
    const { primaryResults, speculativeResults } = await runPackedJobsWithLookahead(
      primaryPayloads, speculativePayloads, requestCharBudget, transport, sourceLang, targetLang, remainingBudgetMs(startedAt), clientUserAgent, resolver
    );

    const resolvedThisRound = new Set<number>();
    for (const [suspectId, job] of jobs) {
      const html = primaryResults.get(suspectId);
      if (html === undefined) continue;
      const text = validateWindowJob(job, html, radius, unitById, strictMarker);
      if (text !== null) {
        recovered.set(suspectId, text);
        resolvedThisRound.add(suspectId);
      }
    }

    for (const [suspectId, specJob] of speculativeJobs) {
      if (resolvedThisRound.has(suspectId)) continue;
      const html = speculativeResults.get(suspectId);
      if (html === undefined) continue;
      const text = validateWindowJob(specJob, html, nextRadius!, unitById, strictMarker);
      if (text !== null) {
        recovered.set(suspectId, text);
        resolvedThisRound.add(suspectId);
      } else {
        skipRadius.set(suspectId, nextRadius!);
      }
    }

    pending = pending.filter((id) => !resolvedThisRound.has(id));
  }

  return recovered;
}

function expectedCueIds(unit: Unit): string[] {
  return unit.spans.filter((s) => s.boundary === "marker").map((s) => s.marker_id);
}

function splitCueChunks(text: string | null | undefined): Map<string, string> {
  const parts = (text || "").split(CUE_MARKER_PATTERN);
  const chunks = new Map<string, string>();
  const seen = new Set<string>();
  for (let i = 1; i < parts.length; i += 2) {
    const cid = parts[i];
    if (seen.has(cid)) {
      chunks.delete(cid);
      continue;
    }
    seen.add(cid);
    chunks.set(cid, (parts[i + 1] || "").trim());
  }
  return chunks;
}

function cueTermMatchesForUnit(unit: Unit): Map<string, TermMatch[]> {
  const result = new Map<string, TermMatch[]>();
  if (unit.spans.length <= 1) {
    for (const span of unit.spans) result.set(span.marker_id, unit.term_matches);
    return result;
  }
  let cursor = 0;
  for (const span of unit.spans) {
    const pos = unit.text.indexOf(span.text, cursor);
    if (pos === -1) {
      result.set(span.marker_id, []);
      continue;
    }
    const start = pos, end = pos + span.text.length;
    cursor = end;
    result.set(span.marker_id, unit.term_matches
      .filter((m) => start <= m.start && m.end <= end)
      .map((m) => ({ ...m, start: m.start - start, end: m.end - start })));
  }
  return result;
}

function buildCueTermMatches(units: Unit[]): Map<string, TermMatch[]> {
  const result = new Map<string, TermMatch[]>();
  for (const unit of units) for (const [cid, matches] of cueTermMatchesForUnit(unit)) result.set(cid, matches);
  return result;
}

function buildMarkerTextById(units: Unit[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const unit of units) for (const span of unit.spans) if (span.boundary === "marker") result.set(span.marker_id, span.text);
  return result;
}

function buildMarkerOrder(units: Unit[]): string[] {
  const order: string[] = [];
  for (const unit of units) for (const span of unit.spans) if (span.boundary === "marker") order.push(span.marker_id);
  return order;
}

function hasTranslatableContent(text: string, groups: TermGroup[]): boolean {
  let cursor = 0;
  const residue: string[] = [];
  for (const g of groups) {
    residue.push(text.slice(cursor, g.start));
    cursor = g.end;
  }
  residue.push(text.slice(cursor));
  return hasContent(residue.join(""));
}

function missingCueIds(unit: Unit, text: string | null | undefined): string[] {
  const expected = expectedCueIds(unit);
  if (!expected.length) return [];
  const present = splitCueChunks(text);
  return expected.filter((cid) => !present.has(cid));
}

function patchMissingCues(text: string, expectedIds: string[], recovered: Map<string, string>): string {
  if (!recovered.size) return text;
  const chunks = splitCueChunks(text);
  for (const [cid, chunk] of recovered) chunks.set(cid, chunk);
  return expectedIds
    .filter((cid) => chunks.has(cid))
    .map((cid) => `${CUE_MARKER_TEMPLATE(cid)} ${chunks.get(cid)}`)
    .join(" ");
}

interface IsolatedJob {
  unitId: number;
  payload: string;
  sentIds: string[];
  isSolo: boolean;
  missingIds: string[];
}

function buildIsolatedJob(
  unitId: number, anchorLo: number, anchorHi: number, radius: number, markerOrder: string[], markerTextById: Map<string, string>,
  markerTermMatches: Map<string, TermMatch[]>, missingIds: string[], requestCharBudget: number
): IsolatedJob | null {
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
  payload = `<div>${payload}</div>`;
  if (!payload || payload.length > requestCharBudget) return null;
  return { unitId, payload, sentIds, isSolo, missingIds };
}

function validateIsolatedJob(
  job: IsolatedJob, html: string, remaining: Set<string>, markerTextById: Map<string, string>, markerTermMatches: Map<string, TermMatch[]>,
  collapseWhitespace: boolean, extraValid?: (original: string, candidate: string) => boolean
): Map<string, string> {
  let markerRes = new Map<string, string>();
  if (job.isSolo && job.sentIds.length === 1) {
    markerRes.set(job.sentIds[0]!, html);
  } else {
    const flat = repairCorruptMarkers(html, "c", job.sentIds);
    markerRes = splitByMarker(flat, CUE_MARKER_PATTERN);
  }

  const jobRecovered = new Map<string, string>();
  for (const cid of job.missingIds) {
    if (!remaining.has(cid)) continue;
    let cand = markerRes.get(cid);
    if (job.isSolo && job.sentIds.length === 1) cand = html;
    if (job.isSolo && cand !== undefined) cand = repairCorruptMarkers(cand, "c", [cid]);
    const orig = markerTextById.get(cid) || "";
    if (cand !== undefined && !CORRUPT_MARKER_SIGNATURE.test(cand) && isLengthPlausible(orig, cand) && (!extraValid || extraValid(orig, cand))) {
      const groups = buildTermGroups(orig, markerTermMatches.get(cid) || []);
      jobRecovered.set(cid, groups.length ? applyTermSubstitution(cand, groups, collapseWhitespace) : cand);
    }
  }
  return jobRecovered;
}

async function retryIsolatedCuesAll(
  missingByUnit: Map<number, string[]>,
  markerOrder: string[],
  markerTextById: Map<string, string>,
  markerTermMatches: Map<string, TermMatch[]>,
  sourceLang: string,
  targetLang: string,
  requestCharBudget: number,
  transport: Transport,
  startedAt: number,
  resolver: LangResolver,
  clientUserAgent?: string,
  extraValid?: (original: string, candidate: string) => boolean
): Promise<Map<number, Map<string, string>>> {
  const position = new Map(markerOrder.map((cid, i) => [cid, i]));
  const collapseWhitespace = languageProfile(targetLang).script === "cjk";
  const recoveredByUnit = new Map<number, Map<string, string>>();

  const anchors = new Map<number, [number, number]>();
  const remainingByUnit = new Map<number, Set<string>>();
  for (const [unitId, missingIds] of missingByUnit) {
    const positions = missingIds.map((cid) => position.get(cid)).filter((p): p is number => p !== undefined).sort((a, b) => a - b);
    if (positions.length === 0) continue;
    anchors.set(unitId, [positions[0]!, positions[positions.length - 1]!]);
    remainingByUnit.set(unitId, new Set(missingIds));
  }
  const skipRadius = new Map<number, number>();

  for (let ladderIndex = 0; ladderIndex < ISOLATED_RADIUS_LADDER.length; ladderIndex++) {
    const radius = ISOLATED_RADIUS_LADDER[ladderIndex]!;
    if (remainingByUnit.size === 0 || transport.isExhausted) break;
    const nextRadius = ladderIndex + 1 < ISOLATED_RADIUS_LADDER.length ? ISOLATED_RADIUS_LADDER[ladderIndex + 1]! : null;

    const jobs = new Map<number, IsolatedJob>();
    for (const [unitId, missingIds] of remainingByUnit) {
      if (skipRadius.get(unitId) === radius) continue;
      const [anchorLo, anchorHi] = anchors.get(unitId)!;
      const job = buildIsolatedJob(unitId, anchorLo, anchorHi, radius, markerOrder, markerTextById, markerTermMatches, Array.from(missingIds), requestCharBudget);
      if (job) jobs.set(unitId, job);
    }
    if (jobs.size === 0) continue;

    const speculativeJobs = new Map<number, IsolatedJob>();
    if (nextRadius !== null) {
      for (const unitId of jobs.keys()) {
        const [anchorLo, anchorHi] = anchors.get(unitId)!;
        const specJob = buildIsolatedJob(unitId, anchorLo, anchorHi, nextRadius, markerOrder, markerTextById, markerTermMatches, Array.from(remainingByUnit.get(unitId)!), requestCharBudget);
        if (specJob) speculativeJobs.set(unitId, specJob);
      }
    }

    const primaryPayloads = new Map([...jobs].map(([id, job]) => [id, job.payload]));
    const speculativePayloads = new Map([...speculativeJobs].map(([id, job]) => [id, job.payload]));
    const { primaryResults, speculativeResults } = await runPackedJobsWithLookahead(
      primaryPayloads, speculativePayloads, requestCharBudget, transport, sourceLang, targetLang, remainingBudgetMs(startedAt), clientUserAgent, resolver
    );

    for (const [unitId, job] of jobs) {
      const html = primaryResults.get(unitId);
      const remaining = remainingByUnit.get(unitId);
      if (html === undefined || !remaining) continue;
      const jobRecovered = validateIsolatedJob(job, html, remaining, markerTextById, markerTermMatches, collapseWhitespace, extraValid);
      if (jobRecovered.size > 0) {
        if (!recoveredByUnit.has(unitId)) recoveredByUnit.set(unitId, new Map());
        const unitRecovered = recoveredByUnit.get(unitId)!;
        for (const [cid, text] of jobRecovered) {
          unitRecovered.set(cid, text);
          remaining.delete(cid);
        }
        if (remaining.size === 0) remainingByUnit.delete(unitId);
      }
    }

    for (const [unitId, specJob] of speculativeJobs) {
      const html = speculativeResults.get(unitId);
      const remaining = remainingByUnit.get(unitId);
      if (html === undefined || !remaining) continue;
      const jobRecovered = validateIsolatedJob(specJob, html, remaining, markerTextById, markerTermMatches, collapseWhitespace, extraValid);
      if (jobRecovered.size > 0) {
        if (!recoveredByUnit.has(unitId)) recoveredByUnit.set(unitId, new Map());
        const unitRecovered = recoveredByUnit.get(unitId)!;
        for (const [cid, text] of jobRecovered) {
          unitRecovered.set(cid, text);
          remaining.delete(cid);
        }
        if (remaining.size === 0) remainingByUnit.delete(unitId);
      }
      if (remainingByUnit.has(unitId)) skipRadius.set(unitId, nextRadius!);
    }
  }

  return recoveredByUnit;
}

export interface TranslateUnitsOptions {
  maxChars: number;
  startedAt: number;
  clientUserAgent?: string;
  onLog?: (message: string) => void;
  contextText?: string;
  onChunk?: (translations: Map<string, string>) => void;
  subrequestLimit?: number;
}

export async function translateUnits(
  transport: Transport, units: Unit[], chapters: Chapter[], cues: Cue[],
  sourceLang: string, targetLang: string, options: TranslateUnitsOptions
): Promise<{ translations: Record<string, string>; skipped: (string | number)[]; resolvedSourceLang: string }> {
  const maxChars = Math.floor(options.maxChars * BATCH_PACK_RATIO);
  const { startedAt } = options;
  const resolver = createLangResolver(options.onLog);
  const resolved = new Map(units.filter((u) => u.resolved !== null).map((u) => [u.id, u.resolved as string]));
  const pending = units.filter((u) => u.resolved === null);
  const chapterOfUnit = new Map<number, number>();
  for (const chapter of chapters) for (const uid of chapter.unit_ids) chapterOfUnit.set(uid, chapter.id);

  const { items, chapterGroups, cueIdsById } = flattenUnits(pending, chapterOfUnit);
  const { translations: translationsRaw, skipped: initialSkipped } = items.length
    ? await translate(
        transport,
        items,
        chapterGroups,
        sourceLang,
        targetLang,
        {
          maxChars,
          startedAt,
          resolver,
          contextText: options.contextText,
          cueIdsById,
          clientUserAgent: options.clientUserAgent,
          onChunk: options.onChunk,
          subrequestLimit: options.subrequestLimit,
        }
      )
    : { translations: new Map<string, string>(), skipped: [] };

  const unitOrder = units.map((u) => u.id);
  const unitPosition = new Map(unitOrder.map((uid, i) => [uid, i]));
  const initialMissingIds = new Set(pending.filter((u) => !translationsRaw.has(String(u.id))).map((u) => u.id));
  const missingUnits = pending.filter((u) => initialMissingIds.has(u.id));

  if (missingUnits.length > 0 && !transport.isExhausted) {
    resolver.log(`retry round: resending ${missingUnits.length} missing unit(s) individually`);
    const entries: PlainEntry[] = missingUnits.map((u) => ({
      id: u.id, payload: `<div>${protectContentHtml(u.text, u.term_matches || [])}</div>`, original: u.text, unit: u
    }));
    const recovered = await recoverPlainItems(entries, sourceLang, targetLang, maxChars, transport, startedAt, resolver, options.clientUserAgent);
    for (const [id, text] of recovered) translationsRaw.set(String(id), text);
  }

  const results = new Map<number, string | null>(resolved);
  const untranslatedCandidates: PlainEntry[] = [];
  for (const unit of pending) {
    const [finalText, sourceText] = resolveTranslation(unit, translationsRaw, targetLang, resolver);
    results.set(unit.id, finalText);
    if (finalText !== null && isUntranslated(finalText, resolver.value || sourceLang, targetLang)) {
      untranslatedCandidates.push({ id: unit.id, payload: `<div>${protectContentHtml(unit.text, unit.term_matches || [])}</div>`, original: sourceText || "", unit });
    }
  }

  if (untranslatedCandidates.length && !transport.isExhausted) {
    resolver.log(`untranslated-script retry: resending ${untranslatedCandidates.length} unit(s) in one merged request`);
    const recovered = await recoverPlainItems(untranslatedCandidates, resolver.value || sourceLang, targetLang, maxChars, transport, startedAt, resolver, options.clientUserAgent);
    for (const { unit } of untranslatedCandidates) {
      const candidate = recovered.get(unit.id);
      if (candidate !== undefined && candidate !== results.get(unit.id)) {
        resolver.log(`cues ${JSON.stringify(unit.spans.map((s) => s.id))}: retry changed result`);
        results.set(unit.id, candidate);
      }
    }
  }

  const unitById = new Map(units.map((u) => [u.id, u]));
  for (const [uid, text] of results) {
    const expected = expectedCueIds(unitById.get(uid)!);
    if (text !== null && expected.length > 0) results.set(uid, repairCorruptMarkers(text, "c", expected));
  }

  const lengthSuspects = new Set(
    [...results.entries()]
      .filter(([uid, text]) => text !== null && hasContent(unitById.get(uid)!.text) && (!hasContent(text) || !isLengthPlausible(unitById.get(uid)!.text, text)))
      .map(([uid]) => uid)
  );
  const cueSuspects = new Set(
    [...results.entries()]
      .filter(([uid, text]) => text !== null && (missingCueIds(unitById.get(uid)!, text).length > 0 || CORRUPT_MARKER_SIGNATURE.test(text) || hasMarkerLeak(unitById.get(uid)!.text, text)))
      .map(([uid]) => uid)
  );

  const markerOrder = buildMarkerOrder(units);
  const markerTextById = buildMarkerTextById(units);
  const cueTermMatches = buildCueTermMatches(units);

  const primarySuspects = new Set([...lengthSuspects, ...cueSuspects, ...initialMissingIds]);
  const allSuspects = new Set<number>();
  for (const uid of primarySuspects) {
    allSuspects.add(uid);
    const pos = unitPosition.get(uid);
    if (pos !== undefined) {
      if (pos > 0) allSuspects.add(unitOrder[pos - 1]);
      if (pos + 1 < unitOrder.length) allSuspects.add(unitOrder[pos + 1]);
    }
  }

  if (transport.isExhausted) {
    allSuspects.clear();
  }

  if (allSuspects.size > 0) {
    const suspectList = Array.from(allSuspects).sort((a, b) => a - b);
    resolver.log(`windowed retry: resending context around ${suspectList.length} suspect unit(s) in one merged request`);
    const recovered = await retryWindowedAll(units, suspectList, resolver.value || sourceLang, targetLang, maxChars, transport, startedAt, resolver, options.clientUserAgent);
    const collapseWhitespace = languageProfile(targetLang).script === "cjk";
    for (const [uid, text] of recovered) {
      const unit = unitById.get(uid)!;
      const groups = buildTermGroups(unit.text, unit.term_matches || []);
      results.set(uid, groups.length ? applyTermSubstitution(text, groups, collapseWhitespace) : text);
    }

    const missingByUnit = new Map<number, string[]>();
    for (const uid of suspectList) {
      const expected = expectedCueIds(unitById.get(uid)!);
      if (expected.length > 0) results.set(uid, repairCorruptMarkers(results.get(uid) as string, "c", expected));
      const remaining = missingCueIds(unitById.get(uid)!, results.get(uid));
      if (!remaining.length) continue;
      const trivial = remaining.filter((cid) => {
        const text = markerTextById.get(cid) || "";
        return !hasTranslatableContent(text, buildTermGroups(text, cueTermMatches.get(cid) || []));
      });
      if (trivial.length) {
        const filled = new Map(trivial.map((cid) => {
          const text = markerTextById.get(cid) || "";
          const groups = buildTermGroups(text, cueTermMatches.get(cid) || []);
          return [cid, groups.length ? applyTermSubstitution(text, groups, collapseWhitespace) : text] as const;
        }));
        results.set(uid, patchMissingCues(results.get(uid) as string, expectedCueIds(unitById.get(uid)!), filled));
        resolver.log(`cues ${trivial} have no translatable content beyond glossary terms, filled without retry`);
      }
      const stillMissing = remaining.filter((cid) => !trivial.includes(cid));
      if (stillMissing.length) missingByUnit.set(uid, stillMissing);
    }

    if (missingByUnit.size) {
      resolver.log(`isolated cue retry: resending cues for ${missingByUnit.size} unit(s) in one merged request`);
      const recoveredCues = await retryIsolatedCuesAll(missingByUnit, markerOrder, markerTextById, cueTermMatches, resolver.value || sourceLang, targetLang, maxChars, transport, startedAt, resolver, options.clientUserAgent);
      for (const [uid, cueIds] of missingByUnit) {
        const unitRecovered = new Map([...(recoveredCues.get(uid) || new Map())].filter(([cid]) => cueIds.includes(cid)));
        if (unitRecovered.size) {
          results.set(uid, patchMissingCues(results.get(uid) as string, expectedCueIds(unitById.get(uid)!), unitRecovered));
          resolver.log(`isolated cue retry: recovered cues ${[...unitRecovered.keys()].sort(compareMarkerIds)}`);
        }
      }
    }
  }

  const leakByUnit = new Map<number, string[]>();
  for (const [uid, text] of results) {
    if (text !== null) {
      const leaked = findLeakedCueIds(unitById.get(uid)!, text, resolver.value || sourceLang, targetLang);
      if (leaked.length > 0) leakByUnit.set(uid, leaked);
    }
  }

  if (transport.isExhausted) {
    leakByUnit.clear();
  }

  if (leakByUnit.size > 0) {
    const leakRecovered = await retryIsolatedCuesAll(
      leakByUnit,
      markerOrder,
      markerTextById,
      cueTermMatches,
      resolver.value || sourceLang,
      targetLang,
      maxChars,
      transport,
      startedAt,
      resolver,
      options.clientUserAgent,
      (orig, cand) => !isLeakedUntranslated(orig, cand, resolver.value || sourceLang, targetLang)
    );
    for (const [uid, rCues] of leakRecovered) {
      const unit = unitById.get(uid)!;
      if (isSinglePlainCue(unit)) {
        results.set(uid, rCues.values().next().value!);
      } else {
        results.set(uid, patchMissingCues(results.get(uid) as string, expectedCueIds(unit), rCues));
      }
      resolver.log(`untranslated-leak retry for unit ${uid}: recovered cues ${[...rCues.keys()].sort(compareMarkerIds)}`);
    }
  }

  const skipped: (string | number)[] = [...results.entries()].filter(([, text]) => text === null).map(([uid]) => uid);
  const translations: Record<string, string> = {};
  for (const [uid, text] of results) if (text !== null) translations[String(uid)] = text;
  
  return { translations, skipped, resolvedSourceLang: resolver.value || sourceLang };
}
