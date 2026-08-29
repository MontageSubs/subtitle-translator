import { remainingBudgetMs } from '../../../config/env';
import { Transport } from "./types";
import { Unit, Chapter, Cue } from "../../../core/types";
import { languageProfile } from "../../../core/languageProfiles";
import { coreLog } from "../../../core/log";
import { escapeRegExp } from "../../../core/srtExtract";
import { reportError } from '../../../http/response';
import { repairCorruptMarkers, CORRUPT_MARKER_SIGNATURE, hasMarkerLeak } from "../markerRepair";

const GROUP_MARKER_PATTERN = /\u27e6g([^\u27e6\u27e7]+)\u27e7/gi;
const groupMarker = (id: number | string) => `\u27e6g${id}\u27e7`;
const CUE_MARKER_TEMPLATE = (id: number) => `\u27e6c${id}\u27e7`;
const CUE_MARKER_PATTERN = /\u27e6c(\d+)\u27e7/gi;
const UNIT_MARKER_TEMPLATE = (id: number) => `\u27e6u${id}\u27e7`;
const UNIT_MARKER_PATTERN = /\u27e6u([^\u27e6\u27e7]+)\u27e7/gi;
const WINDOW_RADIUS_LADDER = [20, 5, 2];
const ISOLATED_RADIUS_LADDER = [5, 2, 0];
const TAG_PATTERN = /<[^>]+>/g;
const ITALIC_PATTERN = /<i>.*?<\/i>/gs;
const CONTENT_CHAR_PATTERN = /[\p{L}\p{N}_]/u;

const STYLE_TAG_PATTERN = /<\/?(i|b|u)>/gi;
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

const WINDOW_KEEP_RADIUS = 2;
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
    new RegExp(WORD_BASED_SCRIPTS.has(name as WordScript) ? `[${chars}]{2,}` : `[${chars}]`, "g"),
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

function log(message: string) {
  coreLog("translate", message);
}

export const MAX_CONTEXT_CHARS = 500;
const CONTEXT_PROBE_SAMPLE_CHARS = 200;

export interface LangResolver {
  note(detected: string | null): void;
  log(message: string): void;
}

export function createLangResolver(onLog?: (message: string) => void): LangResolver & { value: string | null } {
  return {
    value: null as string | null,
    note(this: { value: string | null }, detected: string | null) {
      if (!this.value && detected) this.value = detected;
    },
    log(message: string) {
      onLog?.(message);
      coreLog("translate", message);
    },
  };
}

export async function fanOutTranslations(
  transport: Transport, texts: string[], source: string, target: string, budgetMs: number, clientUserAgent?: string, resolver?: LangResolver,
  onBatchResolved?: (index: number, html: string | null) => void
): Promise<(string | null)[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  const results: (string | null)[] = new Array(texts.length).fill(null);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < texts.length) {
      const i = cursor++;
      try {
        const upstream = await transport.send(texts[i], source, target, clientUserAgent, controller.signal);
        results[i] = upstream.translatedHtml;
        resolver?.note(upstream.detectedLang);
        onBatchResolved?.(i, upstream.translatedHtml);
      } catch (e) {
        reportError(`upstream batch ${i} failed`, e);
        onBatchResolved?.(i, null);
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(BATCH_FANOUT_CONCURRENCY, texts.length) }, runWorker));
  } finally {
    clearTimeout(timer);
  }

  return results;
}

async function probeSourceLanguage(transport: Transport, cues: Cue[], targetLang: string, startedAt: number, clientUserAgent?: string): Promise<string | null> {
  const sample = cues.map((c) => c.text).join(" ").trim().slice(0, CONTEXT_PROBE_SAMPLE_CHARS);
  if (!sample) return null;
  try {
    const upstream = await transport.send(escapeHtml(sample), "auto", targetLang, clientUserAgent, AbortSignal.timeout(remainingBudgetMs(startedAt)));
    return upstream.detectedLang;
  } catch (e) {
    log(`context: source-language probe failed, falling back to auto: ${e instanceof Error ? e.message : String(e)}`);
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
      resolvedSourceLang = (await probeSourceLanguage(transport, cues, targetLang, startedAt, clientUserAgent)) || resolvedSourceLang;
    }
    if (resolvedSourceLang !== "auto") {
      onLog?.(`context: translating supplied context into ${resolvedSourceLang} to match the subtitle`);
      try {
        const upstream = await transport.send(escapeHtml(contextText), "auto", resolvedSourceLang, clientUserAgent, AbortSignal.timeout(remainingBudgetMs(startedAt)));
        resolvedContext = unescapeHtml(upstream.translatedHtml);
      } catch (e) {
        onLog?.("context: translation failed, using the original text as-is");
        log(`context translation failed: ${e instanceof Error ? e.message : String(e)}`);
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

function hasContent(text: string | null | undefined): boolean {
  return Boolean(text) && CONTENT_CHAR_PATTERN.test(text as string);
}

function withinBudget(text: string, limit: number): boolean {
  if (text.length <= limit) return true;
  log(`payload of ${text.length} chars exceeds budget (${limit}), refusing to truncate, skipping`);
  return false;
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
      return `<span id=${idx}>${groupMarker(idx)}${escapeHtml(item.text)}</span>`;
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

const ID_TAG_OPEN_PATTERN = /<(?:span|div)[^>]*\bid=["']?([a-zA-Z0-9:]+)["']?[^>]*>/g;

function parseByIds(html: string, markerPattern: RegExp): Map<number, string> {
  const opens: [number, string][] = [];
  for (const m of html.matchAll(ID_TAG_OPEN_PATTERN)) {
    if (/^\d+$/.test(m[1])) opens.push([m.index! + m[0].length, m[1]]);
  }
  const result = new Map<number, string>();
  opens.forEach(([end, idxStr], i) => {
    const idx = Number(idxStr);
    const chunkEnd = i + 1 < opens.length ? opens[i + 1][0] : html.length;
    const raw = html.slice(end, chunkEnd);
    const stripped = unescapeHtml(raw.replace(ITALIC_PATTERN, "").replace(TAG_PATTERN, ""));
    const text = stripped.replace(markerPattern, "").trim().replace(/\s+/g, " ");
    if (!text) return;
    result.set(idx, result.has(idx) ? `${result.get(idx)} ${text}` : text);
  });
  return result;
}

function parseBySpans(html: string): Map<number, string> {
  return parseByIds(html, GROUP_MARKER_PATTERN);
}

function parseByMarkers(html: string, expectedIds: number[]): Map<number, string> {
  let flat = unescapeHtml(html.replace(ITALIC_PATTERN, "").replace(TAG_PATTERN, ""));
  flat = repairCorruptMarkers(flat, "g", expectedIds);
  const result = new Map<number, string>();
  for (const [key, text] of splitByMarker(flat, GROUP_MARKER_PATTERN)) {
    if (/^\d+$/.test(key) && !CORRUPT_MARKER_SIGNATURE.test(text)) result.set(Number(key), text);
  }
  return result;
}

const MARKER_OVERREACH_RATIO = 1.3;

function chooseCandidate(spanText: string | undefined, markerText: string | undefined): string | undefined {
  if (markerText === undefined) return spanText;
  if (spanText === undefined) return markerText;
  const spanLen = contentLength(spanText);
  if (spanLen && contentLength(markerText) / spanLen > MARKER_OVERREACH_RATIO) return spanText;
  return markerText;
}

function parseTranslatedHtml(html: string, expectedIds: number[]): { spanResult: Map<number, string>; markerResult: Map<number, string> } {
  return { spanResult: parseBySpans(html), markerResult: parseByMarkers(html, expectedIds) };
}

async function sendHtml(transport: Transport, html: string, sourceLang: string, targetLang: string, signal?: AbortSignal, resolver?: LangResolver, clientUserAgent?: string): Promise<string> {
  const upstream = await transport.send(html, sourceLang, targetLang, clientUserAgent, signal ?? new AbortController().signal);
  resolver?.note(upstream.detectedLang);
  return upstream.translatedHtml;
}

function prepareBatch(batch: Item[][], contextText?: string): { items: Item[]; idByIndex: Map<number, string>; html: string } {
  const items = batch.flat();
  const indices = new Map(items.map((item, i) => [item.id, i + 1]));
  const idByIndex = new Map(Array.from(indices, ([id, i]) => [i, id]));
  const html = batch.map((group) => buildChapterHtml(group, indices, contextText)).join("");
  return { items, idByIndex, html };
}

function extractTranslations(translatedHtml: string, items: Item[], idByIndex: Map<number, string>): Map<string, string> {
  const { spanResult, markerResult } = parseTranslatedHtml(translatedHtml, [...idByIndex.keys()]);
  const sourceById = new Map(items.map((item) => [item.id, item.text]));
  const result = new Map<string, string>();
  for (const idx of new Set([...spanResult.keys(), ...markerResult.keys()])) {
    const itemId = idByIndex.get(idx);
    if (itemId === undefined) continue;
    const text = chooseCandidate(spanResult.get(idx), markerResult.get(idx))!;
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

async function sendBatches(
  transport: Transport, batches: Item[][][], sourceLang: string, targetLang: string, budgetMs: number, options: SendBatchesOptions = {}
): Promise<Map<string, string>> {
  if (!batches.length) return new Map();
  const { resolver, contextText, clientUserAgent, onChunk } = options;
  const prepared = batches.map((batch) => prepareBatch(batch, contextText));
  const translations = new Map<string, string>();

  await fanOutTranslations(transport, prepared.map((p) => activateNoTranslateSpans(p.html)), sourceLang, targetLang, budgetMs, clientUserAgent, resolver, (i, translatedHtml) => {
    if (translatedHtml === null || translatedHtml === undefined) {
      log(`batch ${i + 1}/${prepared.length}: no result from upstream, will retry missing units individually`);
      return;
    }
    const chunkTranslations = new Map<string, string>();
    for (const [id, text] of extractTranslations(translatedHtml, prepared[i].items, prepared[i].idByIndex)) {
      translations.set(id, text);
      chunkTranslations.set(id, text);
    }
    if (chunkTranslations.size > 0 && onChunk) onChunk(chunkTranslations);
  });

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
}

async function translate(
  transport: Transport, items: Item[], chapterGroups: string[][], sourceLang: string, targetLang: string, options: TranslateOptions
): Promise<{ translations: Map<string, string>; skipped: string[] }> {
  const { maxChars, startedAt, resolver, contextText, cueIdsById, clientUserAgent, onChunk } = options;
  const { batches, oversized } = buildBatches(items, chapterGroups, maxChars);
  for (const item of oversized) log(`${describeIds([item.id], cueIdsById || new Map())}: ${item.text.length} chars exceeds maxChars (${maxChars}), cue-level content cannot be split further, skipping without truncation`);

  const translations = await sendBatches(transport, batches, sourceLang, targetLang, remainingBudgetMs(startedAt), { resolver, contextText, clientUserAgent, onChunk });

  const oversizedIds = new Set(oversized.map((i) => i.id));
  let missing = items.map((i) => i.id).filter((id) => !translations.has(id) && !oversizedIds.has(id));

  if (missing.length) {
    resolver.log(`retry round: resending ${missing.length} missing unit(s) individually -> ${describeIds(missing, cueIdsById || new Map())}`);
    const missingSet = new Set(missing);
    const filteredGroups = chapterGroups.map((g) => g.filter((id) => missingSet.has(id))).filter((g) => g.length);
    const filteredItems = items.filter((i) => missingSet.has(i.id));
    const { batches: retryBatches } = buildBatches(filteredItems, filteredGroups, maxChars);
    const retryTranslations = await sendBatches(transport, retryBatches, sourceLang, targetLang, remainingBudgetMs(startedAt), { resolver, contextText, clientUserAgent, onChunk });
    for (const [id, text] of retryTranslations) {
      translations.set(id, text);
    }
    missing = missing.filter((id) => !translations.has(id));
  }

  return { translations, skipped: [...oversized.map((i) => i.id), ...missing] };
}

function scriptOf(lang: string | undefined | null): string | undefined {
  return LANGUAGE_SCRIPTS[(lang || "").split("-")[0].toLowerCase()];
}

function isUntranslated(text: string, sourceLang: string, targetLang: string): boolean {
  if (!text) return false;
  const sourceScript = scriptOf(sourceLang);
  const targetScript = scriptOf(targetLang);
  if (!sourceScript || !targetScript || sourceScript === targetScript) return false;
  const pattern = SCRIPT_LEAK_PATTERNS[sourceScript];
  return (text.match(pattern) || []).length > 1;
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

function styleTagsIntact(sourceText: string, translatedText: string): boolean {
  if (!STYLE_TAG_PATTERN.test(sourceText)) return true;
  const openCount = (translatedText.match(/<(i|b|u)>/gi) || []).length;
  const closeCount = (translatedText.match(/<\/(i|b|u)>/gi) || []).length;
  return openCount > 0 && openCount === closeCount;
}

function stripStyleTags(text: string): string {
  return text.replace(STYLE_TAG_PATTERN, "");
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

function resolveTranslation(unit: Unit, translations: Map<string, string>, targetLang: string): [string | null, string | null] {
  const result = translations.get(String(unit.id));
  if (result === undefined) return [null, null];
  const groups = buildTermGroups(unit.text, unit.term_matches);
  const collapseWhitespace = languageProfile(targetLang).script === "cjk";
  let resolved = groups.length ? applyTermSubstitution(result, groups, collapseWhitespace) : result;
  if (!styleTagsIntact(unit.text, resolved)) {
    log(`cues ${JSON.stringify(unit.spans.map((s) => s.id))}: inline style tags lost or unbalanced after translation, stripping to avoid broken markup`);
    resolved = stripStyleTags(resolved);
  }
  return [resolved, wrapTermGroups(unit.text, groups)];
}

function contentLength(text: string | null | undefined): number {
  return (text || "").match(/[\p{L}\p{N}_]/gu)?.length || 0;
}

function isLengthPlausible(sourceText: string, translatedText: string): boolean {
  const sourceLen = contentLength(sourceText);
  if (sourceLen === 0) return true;
  const ratio = contentLength(translatedText) / sourceLen;
  return ratio >= LENGTH_RATIO_MIN && ratio <= LENGTH_RATIO_MAX;
}

interface UntranslatedCandidate {
  unit: Unit;
  sourceText: string;
  groups: TermGroup[];
}

async function retryUntranslated(
  transport: Transport, candidates: UntranslatedCandidate[], sourceLang: string, targetLang: string, maxChars: number, startedAt: number, resolver: LangResolver
): Promise<Map<number, string>> {
  if (!candidates.length) return new Map();
  const items = candidates.map((c) => ({ id: String(c.unit.id), text: c.sourceText }));
  const { batches } = buildBatches(items, items.map((i) => [i.id]), maxChars);
  const raw = await sendBatches(transport, batches, sourceLang, targetLang, remainingBudgetMs(startedAt), { resolver });
  const collapseWhitespace = languageProfile(targetLang).script === "cjk";
  const recovered = new Map<number, string>();
  for (const c of candidates) {
    const text = raw.get(String(c.unit.id));
    if (text !== undefined) recovered.set(c.unit.id, c.groups.length ? applyTermSubstitution(text, c.groups, collapseWhitespace) : text);
  }
  return recovered;
}

interface WindowPlan {
  suspectId: number;
  windowedText: string;
  keepIds: Set<number>;
  window: Unit[];
}

function buildWindowPlan(units: Unit[], suspectId: number, radius: number, batchChars: number): WindowPlan | null {
  const index = new Map(units.map((u, i) => [u.id, i]));
  const i = index.get(suspectId)!;
  const window = units.slice(Math.max(0, i - radius), i + radius + 1);
  if (window.length < 2) return null;
  const pieces = [window[0].text];
  for (const unit of window.slice(1)) pieces.push(` ${UNIT_MARKER_TEMPLATE(unit.id)} `, unit.text);
  const windowedText = pieces.join("");
  if (!withinBudget(windowedText, batchChars)) return null;
  const keepRadius = Math.min(WINDOW_KEEP_RADIUS, radius);
  const keepIds = new Set(units.slice(Math.max(0, i - keepRadius), i + keepRadius + 1).map((u) => u.id));
  return { suspectId, windowedText, keepIds, window };
}

function parseWindowResult(response: string | undefined, plan: WindowPlan): Map<number, string> {
  if (response === undefined) return new Map();
  const unitById = new Map(plan.window.map((u) => [u.id, u]));
  const repaired = repairCorruptMarkers(response, "u", plan.window.map((u) => u.id));
  const lead = repaired.split(UNIT_MARKER_PATTERN, 1)[0].trim();
  const chunks = new Map<number, string>();
  if (lead) chunks.set(plan.window[0].id, lead);
  for (const [key, text] of splitByMarker(repaired, UNIT_MARKER_PATTERN)) {
    if (/^\d+$/.test(key)) chunks.set(Number(key), text);
  }
  const recovered = new Map<number, string>();
  for (const [uid, text] of chunks) {
    if (plan.keepIds.has(uid) && !CORRUPT_MARKER_SIGNATURE.test(text) && isLengthPlausible(unitById.get(uid)!.text, text)) recovered.set(uid, text);
  }
  return recovered;
}

async function retryWindowedMergedAtRadius(
  transport: Transport, units: Unit[], suspectIds: number[], radius: number, sourceLang: string, targetLang: string, maxChars: number, startedAt: number, resolver: LangResolver
): Promise<Map<number, string>> {
  const plans = suspectIds.map((id) => buildWindowPlan(units, id, radius, maxChars)).filter((p): p is WindowPlan => p !== null);
  if (!plans.length) return new Map();
  const items = plans.map((p) => ({ id: String(p.suspectId), text: p.windowedText }));
  const { batches } = buildBatches(items, items.map((i) => [i.id]), maxChars);
  const raw = await sendBatches(transport, batches, sourceLang, targetLang, remainingBudgetMs(startedAt), { resolver });
  const recovered = new Map<number, string>();
  for (const plan of plans) {
    for (const [uid, text] of parseWindowResult(raw.get(String(plan.suspectId)), plan)) recovered.set(uid, text);
  }
  return recovered;
}

async function retryWindowedMerged(
  transport: Transport, units: Unit[], suspectIds: number[], sourceLang: string, targetLang: string, maxChars: number, startedAt: number, resolver: LangResolver
): Promise<Map<number, string>> {
  const recovered = new Map<number, string>();
  let remaining = suspectIds;
  for (const radius of WINDOW_RADIUS_LADDER) {
    if (!remaining.length) break;
    const got = await retryWindowedMergedAtRadius(transport, units, remaining, radius, sourceLang, targetLang, maxChars, startedAt, resolver);
    for (const [uid, text] of got) recovered.set(uid, text);
    remaining = remaining.filter((id) => !recovered.has(id));
  }
  return recovered;
}

function expectedCueIds(unit: Unit): number[] {
  return unit.spans.filter((s) => s.boundary === "marker").map((s) => s.id);
}

function splitCueChunks(text: string | null | undefined): Map<number, string> {
  const parts = (text || "").split(CUE_MARKER_PATTERN);
  const chunks = new Map<number, string>();
  const seen = new Set<number>();
  for (let i = 1; i < parts.length; i += 2) {
    const cid = Number(parts[i]);
    if (seen.has(cid)) {
      chunks.delete(cid);
      continue;
    }
    seen.add(cid);
    chunks.set(cid, (parts[i + 1] || "").trim());
  }
  return chunks;
}

function cueTermMatchesForUnit(unit: Unit): Map<number, TermMatch[]> {
  const result = new Map<number, TermMatch[]>();
  if (unit.spans.length <= 1) {
    for (const span of unit.spans) result.set(span.id, unit.term_matches);
    return result;
  }
  let cursor = 0;
  for (const span of unit.spans) {
    const pos = unit.text.indexOf(span.text, cursor);
    if (pos === -1) {
      result.set(span.id, []);
      continue;
    }
    const start = pos, end = pos + span.text.length;
    cursor = end;
    result.set(span.id, unit.term_matches
      .filter((m) => start <= m.start && m.end <= end)
      .map((m) => ({ ...m, start: m.start - start, end: m.end - start })));
  }
  return result;
}

function buildCueTermMatches(units: Unit[]): Map<number, TermMatch[]> {
  const result = new Map<number, TermMatch[]>();
  for (const unit of units) for (const [cid, matches] of cueTermMatchesForUnit(unit)) result.set(cid, matches);
  return result;
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

function missingCueIds(unit: Unit, text: string | null | undefined): number[] {
  const expected = expectedCueIds(unit);
  if (!expected.length) return [];
  const present = splitCueChunks(text);
  return expected.filter((cid) => !present.has(cid));
}

function patchMissingCues(text: string, expectedIds: number[], recovered: Map<number, string>): string {
  if (!recovered.size) return text;
  const chunks = splitCueChunks(text);
  for (const [cid, chunk] of recovered) chunks.set(cid, chunk);
  return expectedIds
    .filter((cid) => chunks.has(cid))
    .map((cid) => `${CUE_MARKER_TEMPLATE(cid)} ${chunks.get(cid)}`)
    .join(" ");
}

function buildIsolatedDivs(cueIds: number[], cueTextById: Map<number, string>, cueTermMatches: Map<number, TermMatch[]>): string {
  return cueIds
    .filter((cid) => cueTextById.has(cid))
    .map((cid) => {
      const text = cueTextById.get(cid)!;
      const groups = buildTermGroups(text, cueTermMatches.get(cid) || []);
      return `<div id=${cid}>${CUE_MARKER_TEMPLATE(cid)} ${escapeHtml(wrapTermGroups(text, groups))}</div>`;
    })
    .join("");
}

async function retryIsolatedCuesMergedAtRadius(
  transport: Transport, missingByUnit: Map<number, number[]>, radius: number, cueOrder: number[], cueTextById: Map<number, string>,
  cueTermMatches: Map<number, TermMatch[]>, sourceLang: string, targetLang: string, maxChars: number,
  startedAt: number, resolver: LangResolver
): Promise<Map<number, string>> {
  const position = new Map(cueOrder.map((cid, i) => [cid, i]));
  const positions = new Set<number>();
  for (const cueIds of missingByUnit.values()) {
    for (const cid of cueIds) {
      const p = position.get(cid);
      if (p === undefined) continue;
      for (let k = Math.max(0, p - radius); k <= Math.min(cueOrder.length - 1, p + radius); k++) positions.add(k);
    }
  }
  if (!positions.size) return new Map();

  const sentIds = [...positions].sort((a, b) => a - b).map((p) => cueOrder[p]);
  const html = activateNoTranslateSpans(buildIsolatedDivs(sentIds, cueTextById, cueTermMatches));
  if (!withinBudget(html, maxChars)) return new Map();

  let translatedHtml: string;
  try {
    translatedHtml = await sendHtml(transport, html, sourceLang, targetLang, AbortSignal.timeout(remainingBudgetMs(startedAt)), resolver);
  } catch (e) {
    log(`isolated cue retry failed: ${e}`);
    return new Map();
  }

  let flat = unescapeHtml(translatedHtml.replace(TAG_PATTERN, ""));
  flat = repairCorruptMarkers(flat, "c", sentIds);
  const markerResult = splitCueChunks(flat);
  const divResult = parseByIds(translatedHtml, CUE_MARKER_PATTERN);
  const allMissing = new Set([...missingByUnit.values()].flat());
  const collapseWhitespace = languageProfile(targetLang).script === "cjk";
  const out = new Map<number, string>();
  for (const cid of allMissing) {
    const text = chooseCandidate(divResult.get(cid), markerResult.get(cid));
    if (!text || !hasContent(text) || CORRUPT_MARKER_SIGNATURE.test(text) || !isLengthPlausible(cueTextById.get(cid) || "", text)) continue;
    const groups = buildTermGroups(cueTextById.get(cid) || "", cueTermMatches.get(cid) || []);
    out.set(cid, groups.length ? applyTermSubstitution(text, groups, collapseWhitespace) : text);
  }
  return out;
}

async function retryIsolatedCuesMerged(
  transport: Transport, missingByUnit: Map<number, number[]>, cueOrder: number[], cueTextById: Map<number, string>,
  cueTermMatches: Map<number, TermMatch[]>, sourceLang: string, targetLang: string, maxChars: number,
  startedAt: number, resolver: LangResolver
): Promise<Map<number, string>> {
  const recovered = new Map<number, string>();
  let remaining = new Map(missingByUnit);
  for (const radius of ISOLATED_RADIUS_LADDER) {
    if (!remaining.size) break;
    const got = await retryIsolatedCuesMergedAtRadius(transport, remaining, radius, cueOrder, cueTextById, cueTermMatches, sourceLang, targetLang, maxChars, startedAt, resolver);
    for (const [cid, text] of got) recovered.set(cid, text);
    const nextRemaining = new Map<number, number[]>();
    for (const [uid, cueIds] of remaining) {
      const stillMissing = cueIds.filter((cid) => !recovered.has(cid));
      if (stillMissing.length) nextRemaining.set(uid, stillMissing);
    }
    remaining = nextRemaining;
  }
  return recovered;
}

export interface TranslateUnitsOptions {
  maxChars: number;
  startedAt: number;
  clientUserAgent?: string;
  onLog?: (message: string) => void;
  contextText?: string;
  onChunk?: (translations: Map<string, string>) => void;
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
  const { translations: translationsRaw } = items.length
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
        }
      )
    : { translations: new Map<string, string>() };

  const results = new Map<number, string | null>(resolved);
  const untranslatedCandidates: UntranslatedCandidate[] = [];
  for (const unit of pending) {
    const [finalText, sourceText] = resolveTranslation(unit, translationsRaw, targetLang);
    results.set(unit.id, finalText);
    if (finalText !== null && isUntranslated(finalText, sourceLang, targetLang)) {
      untranslatedCandidates.push({ unit, sourceText: sourceText || "", groups: buildTermGroups(unit.text, unit.term_matches) });
    }
  }

  if (untranslatedCandidates.length) {
    resolver.log(`untranslated-script retry: resending ${untranslatedCandidates.length} unit(s) in one merged request`);
    const recovered = await retryUntranslated(transport, untranslatedCandidates, sourceLang, targetLang, maxChars, startedAt, resolver);
    for (const { unit } of untranslatedCandidates) {
      const candidate = recovered.get(unit.id);
      if (candidate !== undefined && candidate !== results.get(unit.id)) {
        log(`cues ${JSON.stringify(unit.spans.map((s) => s.id))}: retry changed result`);
        results.set(unit.id, candidate);
      }
    }
  }

  const unitById = new Map(units.map((u) => [u.id, u]));
  const lengthSuspects = new Set(
    [...results.entries()]
      .filter(([uid, text]) => text !== null && hasContent(unitById.get(uid)!.text) && (!hasContent(text) || !isLengthPlausible(unitById.get(uid)!.text, text)))
      .map(([uid]) => uid)
  );
  const cueSuspects = new Set(
    [...results.entries()]
      .filter(([uid, text]) => text !== null && (missingCueIds(unitById.get(uid)!, text).length > 0 || hasMarkerLeak(unitById.get(uid)!.text, text)))
      .map(([uid]) => uid)
  );
  const suspects = [...new Set([...lengthSuspects, ...cueSuspects])].sort((a, b) => a - b);

  if (suspects.length) {
    resolver.log(`windowed retry: resending context around ${suspects.length} suspect unit(s) in one merged request`);
    const recovered = await retryWindowedMerged(transport, units, suspects, sourceLang, targetLang, maxChars, startedAt, resolver);
    for (const [uid, text] of recovered) results.set(uid, text);

    const cueOrder = cues.map((c) => c.id);
    const cueTextById = new Map(cues.map((c) => [c.id, c.text]));
    const cueTermMatches = buildCueTermMatches(units);
    const collapseWhitespace = languageProfile(targetLang).script === "cjk";
    const missingByUnit = new Map<number, number[]>();
    for (const uid of suspects) {
      const remaining = missingCueIds(unitById.get(uid)!, results.get(uid));
      if (!remaining.length) continue;
      const trivial = remaining.filter((cid) => {
        const text = cueTextById.get(cid) || "";
        return !hasTranslatableContent(text, buildTermGroups(text, cueTermMatches.get(cid) || []));
      });
      if (trivial.length) {
        const filled = new Map(trivial.map((cid) => {
          const text = cueTextById.get(cid) || "";
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
      const recoveredCues = await retryIsolatedCuesMerged(transport, missingByUnit, cueOrder, cueTextById, cueTermMatches, sourceLang, targetLang, maxChars, startedAt, resolver);
      for (const [uid, cueIds] of missingByUnit) {
        const unitRecovered = new Map([...recoveredCues].filter(([cid]) => cueIds.includes(cid)));
        if (unitRecovered.size) {
          results.set(uid, patchMissingCues(results.get(uid) as string, expectedCueIds(unitById.get(uid)!), unitRecovered));
          resolver.log(`isolated cue retry: recovered cues ${[...unitRecovered.keys()].sort((a, b) => a - b)}`);
        }
      }
    }
  }

  const skipped: (string | number)[] = [...results.entries()].filter(([, text]) => text === null).map(([uid]) => uid);
  const translations: Record<string, string> = {};
  for (const [uid, text] of results) if (text !== null) translations[String(uid)] = text;
  return { translations, skipped, resolvedSourceLang: resolver.value || sourceLang };
}
