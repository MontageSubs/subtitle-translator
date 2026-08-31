import { Cue, Unit, Span, BilingualCue } from "./types";
import { isChineseTarget, languageProfile } from "./languageProfiles";
import { getSyncCutter, SyncCutter } from "./segmenter";
import { coreLog } from "./log";

const ELLIPSIS_PATTERN = /\.{2,}|…+/g;
const DASH_ARTIFACT_PATTERN = /—+|-{2,}/g;
const CJK_TERMINATOR_PATTERN = /[。，、]/g;
const HALFWIDTH_COMMA_PATTERN = /(?<!\d)[,](?!\d)/g;
const WHITESPACE_COLLAPSE_PATTERN = /\s+/g;
const WORD_CHAR_PATTERN = /[\p{L}\p{N}_]/u;
const NO_LINE_END_CHARS = new Set([..."“「『（([{＜〈《【〔„‚«‹¿¡'\"‘"]);
const NO_LINE_START_CHARS = new Set([..."”」』）)]}＞〉》】〕»›、，,。.！!？?；;：:'\"’"]);

type BoundaryName = "trail_off" | "comma" | "period" | "colon";
const BOUNDARY_ORDER: BoundaryName[] = ["trail_off", "comma", "period", "colon"];
const BOUNDARY_CLASSIFY_PATTERNS: Record<BoundaryName, RegExp> = {
  trail_off: /(\.{2,}|-{2,}|—+|…+)\s*$/,
  comma: /[,，、]\s*$/,
  period: /[.!?！？]['"”’)\]]*\s*$/,
  colon: /[:：]\s*$/,
};
const BOUNDARY_SEARCH_PATTERNS: Record<BoundaryName, RegExp[]> = {
  trail_off: [/\.{2,}|-{2,}|—+|…+/g],
  comma: [/[,，；;]+/g, /、+/g],
  period: [/[.。!?！？]+['"”’)\]]*/g],
  colon: [/[:：]+/g],
};
const MARKER_PATTERN = /\u27e6c(\d+)\u27e7/g;
const RESIDUAL_MARKER_PATTERN = /\s*(?:\u27e6[^\u27e6\u27e7]*\u27e7|\u27e6[a-zA-Z]?\d{0,6}|\u27e7)\s*/g;

type Logger = (message: string) => void;

function makeLogger(onLog?: Logger): Logger {
  return (message) => {
    coreLog("merge", message);
    onLog?.(message);
  };
}

function usesLatinPunctuation(sourceLang: string | undefined | null): boolean {
  return languageProfile(sourceLang).usesLatinPunctuation;
}

function punctuationAnchorsEnabled(sourceLang: string | undefined | null, targetLang: string | undefined | null): boolean {
  if (!usesLatinPunctuation(sourceLang)) return false;
  return isChineseTarget(targetLang) || usesLatinPunctuation(targetLang);
}

function collectGlossaryTerms(units: Unit[]): Set<string> {
  const terms = new Set<string>();
  for (const unit of units) for (const m of unit.term_matches || []) if (m.target) terms.add(m.target);
  return terms;
}

function enforceLineEdges(text: string): string {
  while (text && NO_LINE_START_CHARS.has(text[0])) text = text.slice(1).trimStart();
  while (text && NO_LINE_END_CHARS.has(text[text.length - 1])) text = text.slice(0, -1).trimEnd();
  return text;
}

function stripTerminator(matched: string, offset: number, full: string): string {
  return WORD_CHAR_PATTERN.test(full.slice(offset + matched.length)) ? " " : "";
}

const CJK_OPEN_QUOTE = "“", CJK_CLOSE_QUOTE = "”";
const TARGET_QUOTE_PAIRS: Record<string, [string, string]> = { zh: [CJK_OPEN_QUOTE, CJK_CLOSE_QUOTE] };
const MUSIC_NOTE_CHARS = "\u2669\u266a\u266b\u266c";
const MUSIC_NOTE_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}]`);
const MUSIC_NOTE_LEADING_GAP_PATTERN = new RegExp(`(?<=\\S)([${MUSIC_NOTE_CHARS}])`, "g");
const MUSIC_NOTE_TRAILING_GAP_PATTERN = new RegExp(`([${MUSIC_NOTE_CHARS}])(?=\\S)`, "g");
const MUSIC_INTERIOR_NOTE_PATTERN = new RegExp(`(?<!^)[${MUSIC_NOTE_CHARS}](?!$)`, "g");
const POSITION_TOP_TAG = "{\\an7}";

function fixMusicSpacing(text: string): string {
  text = text.replace(MUSIC_NOTE_LEADING_GAP_PATTERN, " $1");
  return text.replace(MUSIC_NOTE_TRAILING_GAP_PATTERN, "$1 ");
}

function computeCueMusicFlags(units: Unit[]): Map<number, boolean> {
  const kindsByCue = new Map<number, boolean[]>();
  for (const unit of units) {
    for (const span of unit.spans) {
      if (!kindsByCue.has(span.id)) kindsByCue.set(span.id, []);
      kindsByCue.get(span.id)!.push(span.kind === "music");
    }
  }
  const flags = new Map<number, boolean>();
  for (const [cueId, kinds] of kindsByCue) flags.set(cueId, kinds.length > 0 && kinds.every(Boolean));
  return flags;
}

function formatMusicLine(text: string): string {
  if (text.length > 1) text = text.replace(MUSIC_INTERIOR_NOTE_PATTERN, "");
  text = text.replace(WHITESPACE_COLLAPSE_PATTERN, " ").trim();
  if (!MUSIC_NOTE_PATTERN.test(text[0] || "")) text = text ? `\u266a${text}` : MUSIC_NOTE_CHARS[0];
  if (!MUSIC_NOTE_CHARS.includes(text[text.length - 1])) text = `${text}\u266a`;
  return fixMusicSpacing(text).replace(WHITESPACE_COLLAPSE_PATTERN, " ").trim();
}

function targetQuotePair(targetLang: string | undefined | null): [string, string] | undefined {
  return TARGET_QUOTE_PAIRS[(targetLang || "").split("-")[0].toLowerCase()];
}

function rectifyTranslationQuotes(translatedText: string, originalText: string, targetLang: string | undefined | null): string {
  const quotes = targetQuotePair(targetLang);
  if (!quotes || !translatedText) return translatedText;
  
  const [openQ, closeQ] = quotes;
  const sourceHasQuote = /["”“]/.test(originalText);
  
  const repClose = sourceHasQuote ? closeQ : "";
  const repOpen = sourceHasQuote ? openQ : "";
  
  const phrasePattern = `([^${openQ}${closeQ}。！？…\\n]+)`;
  
  let text = translatedText;
  text = text.replace(new RegExp(`${closeQ}${phrasePattern}${openQ}`, "g"), `${repOpen}$1${repClose}`);
  text = text.replace(new RegExp(`${closeQ}${phrasePattern}${closeQ}`, "g"), `${repOpen}$1${repClose}`);
  text = text.replace(new RegExp(`${openQ}${phrasePattern}${openQ}`, "g"), `${repOpen}$1${repClose}`);
  
  text = text.replace(new RegExp(`${openQ}(\\s*)$`, "g"), `${repClose}$1`);
  text = text.replace(new RegExp(`${openQ}(\\s*[。！？…])`, "g"), `${repClose}$1`);
  text = text.replace(new RegExp(`^(\\s*)${closeQ}`, "g"), `$1${repOpen}`);
  
  return text;
}

function spaceAfterEllipsis(matched: string, offset: number, full: string): string {
  const end = offset + matched.length;
  if (end === full.length || /\s/.test(full[end]) || NO_LINE_START_CHARS.has(full[end])) return "...";
  return "... ";
}

function normalizeTranslation(text: string, targetLang: string): string {
  text = text.replace(DASH_ARTIFACT_PATTERN, "...");
  text = text.replace(ELLIPSIS_PATTERN, spaceAfterEllipsis);
  if (languageProfile(targetLang).stripsCjkTerminalPunctuation) {
    text = text.replace(CJK_TERMINATOR_PATTERN, stripTerminator);
    text = text.replace(HALFWIDTH_COMMA_PATTERN, stripTerminator);
  }
  text = fixMusicSpacing(text);
  text = text.replace(WHITESPACE_COLLAPSE_PATTERN, " ").trim();
  return enforceLineEdges(text);
}

const LATIN_WORD_PATTERN = /[a-zA-Z]+(?:['’][a-zA-Z]+)*/g;
const DIGIT_PATTERN = /\d/g;
const OTHER_WORD_PATTERN = /(?![a-zA-Z0-9])[\p{L}\p{N}]/gu;
const PUNCT_WEIGHT_PATTERN = /[，,、；;。.!?！？：:…]/g;

function effectiveLength(text: string): number {
  const latinWords = (text.match(LATIN_WORD_PATTERN) || []).length;
  const digits = (text.match(DIGIT_PATTERN) || []).length;
  const others = (text.match(OTHER_WORD_PATTERN) || []).length;
  return latinWords * 2.5 + digits * 0.5 + others || text.length;
}

const READING_SPEED_LIMITS = {
  cjk: { cps: 9, max_chars_per_line: 16 },
  default: { cps: 17, max_chars_per_line: 42 },
};

function evaluateReadingSpeed(text: string, durationMs: number, targetLang: string): { cps: number; over_cps: boolean; over_length: boolean } {
  const limits = READING_SPEED_LIMITS[isChineseTarget(targetLang) ? "cjk" : "default"];
  const lines = text.split("\n").filter(Boolean);
  const longestLine = Math.max(...lines.map((line) => effectiveLength(line)), 0);
  const durationSeconds = Math.max(durationMs / 1000, 0.001);
  const cps = effectiveLength(text.replace(/\n/g, " ")) / durationSeconds;
  return {
    cps,
    over_cps: cps > limits.cps,
    over_length: longestLine > limits.max_chars_per_line,
  };
}

const FALLBACK_BOUNDARY_PATTERN = /[，,、；;。.!?…\s]+/g;
const WHITESPACE_TOKEN_PATTERN = /\S+\s*/g;

function wordBoundaries(text: string, cutFn: SyncCutter | null): number[] {
  if (cutFn) {
    const boundaries = [0];
    for (const word of cutFn(text)) boundaries.push(boundaries[boundaries.length - 1] + word.length);
    return boundaries.filter((b) => b === 0 || b === text.length || (text[b - 1] !== "·" && text[b] !== "·"));
  }
  if (/\s/.test(text)) {
    const boundaries = [0, ...[...text.matchAll(WHITESPACE_TOKEN_PATTERN)].map((m) => m.index! + m[0].length)];
    return [...new Set([...boundaries, text.length])].sort((a, b) => a - b);
  }
  const boundaries = new Set([0, text.length]);
  for (const m of text.matchAll(FALLBACK_BOUNDARY_PATTERN)) boundaries.add(m.index! + m[0].length);
  return [...boundaries].sort((a, b) => a - b);
}

function nearestBoundary(boundaries: number[], target: number): number {
  return boundaries.reduce((best, b) => (Math.abs(b - target) < Math.abs(best - target) ? b : best));
}

function classifyBoundary(text: string): BoundaryName | null {
  for (const name of BOUNDARY_ORDER) if (BOUNDARY_CLASSIFY_PATTERNS[name].test(text)) return name;
  return null;
}

function resolveMarkerAnchors(text: string, spans: Span[]): Map<number, number> {
  const positions = new Map<number, number>();
  for (const m of text.matchAll(MARKER_PATTERN)) {
    const id = Number(m[1]);
    if (!positions.has(id)) positions.set(id, m.index!);
  }
  const anchors = new Map<number, number>();
  for (let i = 0; i < spans.length - 1; i++) {
    const next = spans[i + 1];
    if (next.boundary === "marker" && positions.has(next.id)) anchors.set(i, positions.get(next.id)!);
  }
  return anchors;
}

function computeExpectedPositions(translatedText: string, spans: Span[]): number[] {
  const lengths = spans.map((span) => effectiveLength(span.text));
  const total = lengths.reduce((a, b) => a + b, 0) || 1;

  const weights = new Array(translatedText.length).fill(0);
  for (const m of translatedText.matchAll(LATIN_WORD_PATTERN)) {
    const w = 2.5 / m[0].length;
    for (let i = m.index!; i < m.index! + m[0].length; i++) weights[i] = w;
  }
  for (const m of translatedText.matchAll(DIGIT_PATTERN)) weights[m.index!] = 0.5;
  for (const m of translatedText.matchAll(OTHER_WORD_PATTERN)) weights[m.index!] = 1.0;
  for (const m of translatedText.matchAll(PUNCT_WEIGHT_PATTERN)) weights[m.index!] = 0.5;
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let cumulative = 0;
  const expected: number[] = [];
  for (const length of lengths.slice(0, -1)) {
    cumulative += length;
    const targetRatio = cumulative / total;
    if (totalWeight > 0) {
      const targetWeight = totalWeight * targetRatio;
      let curr = 0, pos = translatedText.length;
      for (let j = 0; j < weights.length; j++) {
        curr += weights[j];
        if (curr >= targetWeight) { pos = j; break; }
      }
      expected.push(pos);
    } else {
      expected.push(translatedText.length * targetRatio);
    }
  }
  return expected;
}

function resolveAnchorCuts(text: string, spans: Span[], boundaryTypes: (BoundaryName | null)[], protectedSpans: [number, number][], expected: number[]): Map<number, number> {
  const candidatesByType = new Map<BoundaryName, number[][]>();
  const used = new Set<number>();
  const anchors = new Map<number, number>();
  boundaryTypes.forEach((boundary, i) => {
    if (!boundary) return;
    if (!candidatesByType.has(boundary)) {
      const tiers = BOUNDARY_SEARCH_PATTERNS[boundary].map((pattern) =>
        [...text.matchAll(pattern)]
          .filter((m) => !insideProtectedSpan(m.index! + m[0].length, protectedSpans) && !isLeadingPunctRun(text, m.index!))
          .map((m) => m.index! + m[0].length)
      );
      candidatesByType.set(boundary, tiers);
    }
    const chunk = expected[i] - (i > 0 ? expected[i - 1] : 0);
    const tolerance = Math.max(ORIGINAL_PUNCT_TOLERANCE[boundary] * chunk, PUNCT_PROXIMITY_CHARS);
    for (const tier of candidatesByType.get(boundary)!) {
      const available = tier.filter((c) => !used.has(c) && Math.abs(c - expected[i]) <= tolerance);
      if (!available.length) continue;
      const cut = available.reduce((best, c) => (Math.abs(c - expected[i]) < Math.abs(best - expected[i]) ? c : best));
      anchors.set(i, cut);
      used.add(cut);
      break;
    }
  });
  return anchors;
}

const CLOSING_TAIL_CHARS = "'\"”’)\\]}》」』】〕＞〉»›";
const GENERAL_STRONG_PUNCT_PATTERN = new RegExp(`[，,、；;。.!?！？：:]+[${CLOSING_TAIL_CHARS}]*`, "g");
const GENERAL_WEAK_PUNCT_PATTERN = new RegExp(`(?:\\.{2,}|—+|…+)[${CLOSING_TAIL_CHARS}]*`, "g");
const LEFT_CUT_PATTERN = /[“「『（([{＜〈《【〔„‚«‹¿¡]/g;
const BOOK_TITLE_PATTERN = /《[^《》]*》/g;
const EMBEDDED_QUOTE_PATTERN = /“[^“”]*”/g;
const EMBEDDED_QUOTE_MAX_CHARS = 16;
const ORIGINAL_PUNCT_TOLERANCE: Record<BoundaryName, number> = { trail_off: 0.6, comma: 0.3, period: 0.25, colon: 0.25 };
const INFERRED_PUNCT_TOLERANCE = 0.15;
const INFERRED_WEAK_PUNCT_TOLERANCE = 0.06;
const PUNCT_PROXIMITY_CHARS = 8;
const PUNCT_PROXIMITY_CHARS_WEAK = 3;

function isLeadingPunctRun(text: string, matchStart: number): boolean {
  return matchStart > 0 && NO_LINE_END_CHARS.has(text[matchStart - 1]);
}

function findProtectedSpans(text: string, glossaryTerms: Set<string>, targetLang: string | undefined | null): [number, number][] {
  const spans: [number, number][] = [];
  for (const m of text.matchAll(BOOK_TITLE_PATTERN)) spans.push([m.index!, m.index! + m[0].length]);
  for (const m of text.matchAll(LATIN_WORD_PATTERN)) spans.push([m.index!, m.index! + m[0].length]);
  for (const m of text.matchAll(MARKER_PATTERN)) spans.push([m.index!, m.index! + m[0].length]);
  for (const m of text.matchAll(ELLIPSIS_PATTERN)) spans.push([m.index!, m.index! + m[0].length]);
  if (targetQuotePair(targetLang)) {
    for (const m of text.matchAll(EMBEDDED_QUOTE_PATTERN)) {
      if (m.index! > 0 && m.index! + m[0].length < text.length && m[0].length <= EMBEDDED_QUOTE_MAX_CHARS) {
        spans.push([m.index!, m.index! + m[0].length]);
      }
    }
  }
  for (const term of glossaryTerms) {
    if (!term) continue;
    let start = 0;
    while (true) {
      const idx = text.indexOf(term, start);
      if (idx < 0) break;
      spans.push([idx, idx + term.length]);
      start = idx + term.length;
    }
  }
  return spans;
}

function insideProtectedSpan(pos: number, protectedSpans: [number, number][]): boolean {
  return protectedSpans.some(([start, end]) => start < pos && pos < end);
}

function escapeProtectedSpan(pos: number, protectedSpans: [number, number][]): number {
  for (const [start, end] of protectedSpans) {
    if (start < pos && pos < end) return pos - start <= end - pos ? start : end;
  }
  return pos;
}

function resolveCut(
  text: string, cursor: number, expected: number, boundary: BoundaryName | null, maxCut: number,
  protectedSpans: [number, number][], targetLang: string, cutFn: SyncCutter | null, anchor: number | undefined
): [number, "original" | "inferred" | null] {
  const limit = text.length;
  const ceiling = Math.min(limit, maxCut);
  if (anchor !== undefined && cursor < anchor && anchor < ceiling) return [anchor, "original"];
  const chunk = Math.max(expected - cursor, 0);
  if (boundary) {
    let cut: number | undefined;
    for (const pattern of BOUNDARY_SEARCH_PATTERNS[boundary]) {
      pattern.lastIndex = 0;
      const candidates: number[] = [];
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text))) {
        const end = m.index + m[0].length;
        if (cursor < end && end < ceiling && !insideProtectedSpan(end, protectedSpans) && !isLeadingPunctRun(text, m.index)) candidates.push(end);
      }
      if (candidates.length) {
        cut = candidates.reduce((best, c) => (Math.abs(c - expected) < Math.abs(best - expected) ? c : best));
        break;
      }
    }
    if (cut !== undefined && Math.abs(cut - expected) <= Math.max(ORIGINAL_PUNCT_TOLERANCE[boundary] * chunk, PUNCT_PROXIMITY_CHARS)) return [cut, "original"];
  }
  const strong: number[] = [];
  GENERAL_STRONG_PUNCT_PATTERN.lastIndex = 0;
  let sm: RegExpExecArray | null;
  while ((sm = GENERAL_STRONG_PUNCT_PATTERN.exec(text))) {
    const end = sm.index + sm[0].length;
    if (cursor < end && end < ceiling && !insideProtectedSpan(end, protectedSpans) && !isLeadingPunctRun(text, sm.index)) strong.push(end);
  }
  LEFT_CUT_PATTERN.lastIndex = 0;
  let lm: RegExpExecArray | null;
  while ((lm = LEFT_CUT_PATTERN.exec(text))) {
    if (cursor < lm.index && lm.index < ceiling && !insideProtectedSpan(lm.index, protectedSpans)) strong.push(lm.index);
  }
  if (strong.length) {
    const cut = strong.reduce((best, c) => (Math.abs(c - expected) < Math.abs(best - expected) ? c : best));
    if (Math.abs(cut - expected) <= Math.max(INFERRED_PUNCT_TOLERANCE * chunk, PUNCT_PROXIMITY_CHARS)) return [cut, "inferred"];
  }
  const weak: number[] = [];
  GENERAL_WEAK_PUNCT_PATTERN.lastIndex = 0;
  let wm: RegExpExecArray | null;
  while ((wm = GENERAL_WEAK_PUNCT_PATTERN.exec(text))) {
    const end = wm.index + wm[0].length;
    if (cursor < end && end < ceiling && !insideProtectedSpan(end, protectedSpans) && !isLeadingPunctRun(text, wm.index)) weak.push(end);
  }
  if (weak.length) {
    const cut = weak.reduce((best, c) => (Math.abs(c - expected) < Math.abs(best - expected) ? c : best));
    if (Math.abs(cut - expected) <= Math.max(INFERRED_WEAK_PUNCT_TOLERANCE * chunk, PUNCT_PROXIMITY_CHARS_WEAK)) return [cut, "inferred"];
  }
  const boundaries = wordBoundaries(text.slice(cursor), cutFn)
    .map((b) => b + cursor)
    .filter((b) => cursor < b && b < ceiling && !insideProtectedSpan(b, protectedSpans));
  if (boundaries.length) return [nearestBoundary(boundaries, expected), null];
  return [escapeProtectedSpan(Math.max(cursor + 1, Math.min(Math.round(expected), ceiling - 1)), protectedSpans), null];
}

function enforcePunctuationPlacement(parts: string[]): string[] {
  parts = [...parts];
  for (let i = 0; i < parts.length - 1; i++) {
    while (parts[i] && NO_LINE_END_CHARS.has(parts[i][parts[i].length - 1])) {
      parts[i + 1] = parts[i][parts[i].length - 1] + parts[i + 1];
      parts[i] = parts[i].slice(0, -1);
    }
    while (parts[i + 1] && NO_LINE_START_CHARS.has(parts[i + 1][0])) {
      parts[i] = parts[i] + parts[i + 1][0];
      parts[i + 1] = parts[i + 1].slice(1);
    }
  }
  return parts.map((p) => p.trim());
}

function splitByBoundary(
  translatedText: string, spans: Span[], protectedSpans: [number, number][], targetLang: string, sourceLang: string | undefined, cutFn: SyncCutter | null
): [string[], string] {
  const boundaryTypes = spans.slice(0, -1).map((span) => classifyBoundary(span.text));
  const expectedPositions = computeExpectedPositions(translatedText, spans);
  const anchors = punctuationAnchorsEnabled(sourceLang, targetLang) ? resolveAnchorCuts(translatedText, spans, boundaryTypes, protectedSpans, expectedPositions) : new Map<number, number>();
  const markerAnchors = resolveMarkerAnchors(translatedText, spans);
  for (const [i, pos] of markerAnchors) anchors.set(i, pos);
  let cursor = 0;
  const parts: string[] = [];
  const tags: (string | null)[] = [];

  for (let i = 0; i < spans.length - 1; i++) {
    const boundary = boundaryTypes[i];
    const expected = expectedPositions[i];
    const maxCut = translatedText.length - (spans.length - 1 - i);
    const [cut, tag] = resolveCut(translatedText, cursor, expected, boundary, maxCut, protectedSpans, targetLang, cutFn, anchors.get(i));
    tags.push(markerAnchors.get(i) === cut ? "marker" : tag);
    parts.push(translatedText.slice(cursor, cut).trim());
    cursor = cut;
  }
  parts.push(translatedText.slice(cursor).trim());
  const method = tags.includes("marker")
    ? (tags.every((t) => t === null || t === "marker") ? "marker_boundary" : "mixed_boundary")
    : tags.includes("original") ? "original_boundary" : tags.includes("inferred") ? "inferred_punctuation" : "word_boundary";
  return [parts, method];
}

function hasContent(text: string): boolean {
  return WORD_CHAR_PATTERN.test(text);
}

function repairEmptyParts(parts: string[], spans: Span[], protectedSpans: [number, number][], targetLang: string, sourceLang: string | undefined, cutFn: SyncCutter | null): string[] {
  parts = [...parts];
  for (let i = 0; i < parts.length; i++) {
    if (hasContent(parts[i])) continue;
    const neighbor = i > 0 ? i - 1 : i + 1;
    if (!(neighbor >= 0 && neighbor < parts.length)) continue;
    const [lo, hi] = [i, neighbor].sort((a, b) => a - b);
    const [fixed] = splitByBoundary(parts[neighbor], spans.slice(lo, hi + 1), protectedSpans, targetLang, sourceLang, cutFn);
    parts[lo] = fixed[0];
    parts[hi] = fixed[1];
  }
  return parts;
}

function enforceQuoteClosure(parts: string[], targetLang: string | undefined | null): string[] {
  const quotes = targetQuotePair(targetLang);
  if (!quotes || parts.length < 2) return parts;
  const [openQ, closeQ] = quotes;
  return parts.map((part) => {
    if (!part) return part;
    const openCount = (part.match(new RegExp(openQ, "g")) || []).length;
    const closeCount = (part.match(new RegExp(closeQ, "g")) || []).length;
    if (openCount > closeCount) return part + closeQ.repeat(openCount - closeCount);
    if (closeCount > openCount) return openQ.repeat(closeCount - openCount) + part;
    return part;
  });
}

function splitTranslation(
  translatedText: string, spans: Span[], protectedSpans: [number, number][], targetLang: string, sourceLang: string | undefined, cutFn: SyncCutter | null
): [string[], string] {
  let parts: string[], method: string;
  if (spans.length === 1) {
    [parts, method] = [[translatedText.trim()], "single"];
  } else {
    [parts, method] = splitByBoundary(translatedText, spans, protectedSpans, targetLang, sourceLang, cutFn);
  }
  parts = parts.map((p) => p.replace(RESIDUAL_MARKER_PATTERN, " ").trim());
  parts = enforcePunctuationPlacement(parts);
  parts = repairEmptyParts(parts, spans, protectedSpans, targetLang, sourceLang, cutFn);
  return [enforceQuoteClosure(parts, targetLang), method];
}

const BRACKET_CHAR_PATTERN = /[()（）\[\]【】{}]/;
const BRACKET_CONTENT_PATTERN = /[(（\[【{][^()（）\[\]【】{}]*[)）\]】}]/g;

function stripUnsourcedBrackets(originalText: string, translatedText: string): string {
  if (BRACKET_CHAR_PATTERN.test(originalText)) return translatedText;
  let stripped = translatedText;
  while (BRACKET_CONTENT_PATTERN.test(stripped)) {
    BRACKET_CONTENT_PATTERN.lastIndex = 0;
    stripped = stripped.replace(BRACKET_CONTENT_PATTERN, "");
  }
  return stripped;
}

const FULLWIDTH_TO_ASCII: Record<string, string> = { "！": "!", "？": "?" };
const EXCLAIM_QUESTION_RUN_PATTERN = /[！？!?]+/g;

function normalizeExclaimQuestion(text: string): string {
  return text.replace(EXCLAIM_QUESTION_RUN_PATTERN, (match, offset) => {
    const run = [...match].map((c) => FULLWIDTH_TO_ASCII[c] || c).join("");
    const end = offset + match.length;
    return end === text.length || text[end] === " " ? run : run + " ";
  });
}

function determineDashStyle(cues: Cue[]): string {
  let spaceCount = 0, nospaceCount = 0;
  for (const cue of cues) {
    for (const rawLine of cue.text.split("\n")) {
      const line = rawLine.trim();
      if (line.startsWith("-")) {
        if (line.startsWith("- ")) spaceCount += 1;
        else nospaceCount += 1;
      }
    }
    if (spaceCount + nospaceCount >= 9) break;
  }
  const total = spaceCount + nospaceCount;
  if (total > 0 && spaceCount / total >= 2 / 3) return "- ";
  return "-";
}

const DASH_REPLACE_PATTERN = /(^|\s)-\s*/g;

export interface ApproxSplit {
  unit_id: number;
  cues: number[];
  method: string;
}

export interface QualityWarning {
  cue_id: number;
  cps: number;
  over_cps: boolean;
  over_length: boolean;
}

export interface MergeResult {
  cues: BilingualCue[];
  approx_splits: ApproxSplit[];
  missing_count: number;
  missing_cues: number[];
  quality_warnings: QualityWarning[];
}

interface CueFinal {
  translation: string | null;
  qualityWarning?: QualityWarning;
}

const APPROX_SPLIT_SAFE_METHODS = new Set(["single", "original_boundary", "inferred_punctuation", "marker_boundary", "mixed_boundary"]);

export class BilingualMerger {
  private readonly cueSegments = new Map<number, Map<number, string>>();
  private readonly cueExpectedDashIndices = new Map<number, Set<number>>();
  private readonly cueFinal = new Map<number, CueFinal>();
  private readonly unitProcessedText = new Map<number, string>();
  private readonly unitApproxSplit = new Map<number, ApproxSplit>();
  private readonly cueById = new Map<number, Cue>();

  private constructor(
    private readonly cues: Cue[],
    private readonly units: Unit[],
    private sourceLang: string | undefined,
    private readonly targetLang: string,
    private readonly cutFn: SyncCutter | null,
    private readonly glossaryTerms: Set<string>,
    private readonly dashStyle: string,
    private readonly cueAllMusic: Map<number, boolean>
  ) {
    for (const cue of cues) this.cueById.set(cue.id, cue);
    for (const unit of units) {
      for (const span of unit.spans) {
        if (!this.cueExpectedDashIndices.has(span.id)) this.cueExpectedDashIndices.set(span.id, new Set());
        this.cueExpectedDashIndices.get(span.id)!.add(span.dash_index || 0);
      }
    }
  }

  static async create(cues: Cue[], units: Unit[], sourceLang: string | undefined, targetLang: string): Promise<BilingualMerger> {
    const glossaryTerms = collectGlossaryTerms(units);
    const cutFn = await getSyncCutter(targetLang);
    return new BilingualMerger(cues, units, sourceLang, targetLang, cutFn, glossaryTerms, determineDashStyle(cues), computeCueMusicFlags(units));
  }

  updateSourceLang(sourceLang: string | undefined): void {
    if (sourceLang === this.sourceLang) return;
    this.sourceLang = sourceLang;
    this.unitProcessedText.clear();
  }

  ingest(translations: Record<string, string>): void {
    for (const unit of this.units) {
      const translated = translations[String(unit.id)];
      if (translated === undefined || this.unitProcessedText.get(unit.id) === translated) continue;
      this.processUnit(unit, translated);
    }
  }

  private processUnit(unit: Unit, translated: string): void {
    const spans = unit.spans;
    const originalText = spans.map((s) => s.text).join("");
    let stripped = stripUnsourcedBrackets(originalText, translated);
    stripped = rectifyTranslationQuotes(stripped, originalText, this.targetLang);
    const protectedSpans = findProtectedSpans(stripped, this.glossaryTerms, this.targetLang);
    const [parts, method] = splitTranslation(stripped, spans, protectedSpans, this.targetLang, this.sourceLang, this.cutFn);

    if (APPROX_SPLIT_SAFE_METHODS.has(method)) {
      this.unitApproxSplit.delete(unit.id);
    } else {
      this.unitApproxSplit.set(unit.id, { unit_id: unit.id, cues: spans.map((s) => s.id), method });
    }
    this.unitProcessedText.set(unit.id, translated);

    const affectedCues = new Set<number>();
    spans.forEach((span, i) => {
      let part = normalizeTranslation(parts[i], this.targetLang);
      if (span.kind === "music" && !this.cueAllMusic.get(span.id)) part = formatMusicLine(part);
      if (!this.cueSegments.has(span.id)) this.cueSegments.set(span.id, new Map());
      this.cueSegments.get(span.id)!.set(span.dash_index || 0, part);
      affectedCues.add(span.id);
    });
    for (const cueId of affectedCues) this.recomputeCue(cueId);
  }

  private recomputeCue(cueId: number): void {
    const expected = this.cueExpectedDashIndices.get(cueId);
    const segments = this.cueSegments.get(cueId);
    if (!expected || !segments || segments.size < expected.size) {
      this.cueFinal.set(cueId, { translation: null });
      return;
    }
    const dashIndices = Array.from(segments.keys()).sort((a, b) => a - b);
    const parts = dashIndices.map((d) => segments.get(d)!);
    let translation = parts.length > 1 ? parts.map((p) => `-${p.replace(/^[- ]+/, "")}`).join(" ") : parts[0]!;

    translation = translation.replace(DASH_REPLACE_PATTERN, `$1${this.dashStyle}`);
    translation = normalizeExclaimQuestion(translation);
    if (this.cueAllMusic.get(cueId)) {
      translation = isChineseTarget(this.targetLang) ? POSITION_TOP_TAG + formatMusicLine(translation) : formatMusicLine(translation);
    }

    let qualityWarning: QualityWarning | undefined;
    const cue = this.cueById.get(cueId);
    if (cue) {
      const metrics = evaluateReadingSpeed(translation, cue.end_ms - cue.start_ms, this.targetLang);
      if (metrics.over_cps || metrics.over_length) qualityWarning = { cue_id: cueId, ...metrics };
    }
    this.cueFinal.set(cueId, { translation, qualityWarning });
  }

  snapshot(onLog?: Logger): MergeResult {
    const resultCues: BilingualCue[] = this.cues.map((cue) => ({ ...cue, translation: this.cueFinal.get(cue.id)?.translation ?? null }));
    const approxSplits = this.units.map((u) => this.unitApproxSplit.get(u.id)).filter((s): s is ApproxSplit => !!s);
    const qualityWarnings = this.cues.map((c) => this.cueFinal.get(c.id)?.qualityWarning).filter((w): w is QualityWarning => !!w);
    const missingCues = resultCues.filter((c) => c.translation === null).map((c) => c.id);

    if (onLog) {
      const log = makeLogger(onLog);
      if (approxSplits.length > 0) log(`recovered ${approxSplits.length} splits (lengths implausible)`);
      if (missingCues.length > 0) log(`failed to merge ${missingCues.length} cues`);
    }

    return { cues: resultCues, approx_splits: approxSplits, missing_count: missingCues.length, missing_cues: missingCues, quality_warnings: qualityWarnings };
  }
}

export async function merge(
  cues: Cue[], units: Unit[], translations: Record<string, string>, sourceLang: string, targetLang: string, onLog?: Logger
): Promise<MergeResult> {
  const merger = await BilingualMerger.create(cues, units, sourceLang, targetLang);
  merger.ingest(translations);
  return merger.snapshot(onLog);
}
