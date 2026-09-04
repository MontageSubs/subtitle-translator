import { Cue, Chapter, Unit, Span } from "./types";
import { languageProfile } from "./languageProfiles";
import { ProtocolCue } from '../http/protocol';
import { cueMarkerTag, assignMarkerIds } from "./cueMarker";

const TAG_PATTERN = /<[^>]+>|\{[^}]*\}/g;
const STYLE_TAG_PATTERN = /<\/?(i|b|u)>/gi;
const STYLE_TAG_TEST_PATTERN = /<\/?(i|b|u)>/i;
const STYLE_TAG_PLACEHOLDER = (index: number) => `\u0001${index}\u0001`;
const STYLE_TAG_PLACEHOLDER_PATTERN = /\u0001(\d+)\u0001/g;
const STYLE_TAG_ALT = "(?:</?(?:i|b|u)>)";
const STYLE_OPEN_ALT = "(?:<(?:i|b|u)>)";
const STYLE_CLOSE_ALT = "(?:</(?:i|b|u)>)";
const FULL_WRAP_PATTERN = /^<(i|b|u)>([\s\S]*)<\/\1>$/i;

function stripTagsPreservingStyle(line: string): string {
  const preserved: string[] = [];
  const guarded = line.replace(STYLE_TAG_PATTERN, (tag) => {
    preserved.push(tag.toLowerCase());
    return STYLE_TAG_PLACEHOLDER(preserved.length - 1);
  });
  return guarded.replace(TAG_PATTERN, "").replace(STYLE_TAG_PLACEHOLDER_PATTERN, (_, i) => preserved[Number(i)]);
}

const WHITESPACE_PATTERN = /\s+/g;
const TERMINAL_PUNCT_PATTERN = new RegExp(`[.!?。！？][’”"')\\]」』】）]*${STYLE_CLOSE_ALT}*\\s*$`, "i");
const TRAILING_ELLIPSIS_PATTERN = new RegExp(`(\\.{2,}|…)${STYLE_CLOSE_ALT}*\\s*$`, "i");
const TRAILING_CUTOFF_PATTERN = new RegExp(`-{2,}${STYLE_CLOSE_ALT}*\\s*$`, "i");
const TRAILING_SINGLE_CUTOFF_PATTERN = new RegExp(`(?<!-)-${STYLE_CLOSE_ALT}*\\s*$`, "i");
const DIALOGUE_DASH_PATTERN = new RegExp(`(?:^|(?<=\\s))${STYLE_TAG_ALT}*-(?!-)${STYLE_TAG_ALT}*\\s?`, "gi");
const STUTTER_WORD_PATTERN = /(?<![A-Za-z])([A-Za-z])-\1(?![A-Za-z])/gi;
const STUTTER_PREFIX_PATTERN = /(?<![A-Za-z])([A-Za-z])-(?=\1[a-z])/gi;
const SHORT_REPLY_TOKEN_PATTERN = /[A-Za-z0-9]/g;
const SHORT_REPLY_MAX_TOKENS = 3;
const STUTTER_RESIDUAL_PATTERN = /[A-Za-z]/g;
const TRAILING_MARK_PATTERN = new RegExp(`[!?…]+${STYLE_CLOSE_ALT}*$`, "i");
const GAP_THRESHOLD_MS = 200;
const WORD_TOKEN_PATTERN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
const ISOLATED_MAX_CHARS_NON_LATIN = 4;
const SCENE_ADJACENCY_MS = 1500;

const MUSIC_NOTE_CHARS = "\u2669\u266a\u266b\u266c";
const MUSIC_NOTE_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}]`);
const LEADING_ELLIPSIS_PATTERN = new RegExp(`^${STYLE_OPEN_ALT}*(\\.{2,}|\\u2026)`, "i");
const LEADING_NON_LETTER_PATTERN = /^[^A-Za-z]*/;
const STYLE_TAG_LEADING_PATTERN = new RegExp(`^${STYLE_OPEN_ALT}+`, "i");
const EDGE_NOTE_PATTERN = new RegExp(`^[${MUSIC_NOTE_CHARS}\\s]+|[${MUSIC_NOTE_CHARS}\\s]+$`, "g");
const EDGE_NOTE_LEADING_PATTERN = new RegExp(`^[${MUSIC_NOTE_CHARS}\\s]+`);
const EDGE_NOTE_TRAILING_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}\\s]+$`);

function splitFullWrap(text: string): { text: string; styleWrap: "i" | "b" | "u" | null } {
  text = text.trim();
  const leadingMatch = EDGE_NOTE_LEADING_PATTERN.exec(text);
  const leading = leadingMatch ? leadingMatch[0] : "";
  const remainder = text.slice(leading.length);
  const trailingMatch = EDGE_NOTE_TRAILING_PATTERN.exec(remainder);
  const trailing = trailingMatch ? trailingMatch[0] : "";
  const core = trailing ? remainder.slice(0, remainder.length - trailing.length) : remainder;
  const match = FULL_WRAP_PATTERN.exec(core);
  if (!match || STYLE_TAG_TEST_PATTERN.test(match[2])) return { text, styleWrap: null };
  return { text: `${leading}${match[2].trim()}${trailing}`, styleWrap: match[1].toLowerCase() as "i" | "b" | "u" };
}

function isLatinSource(sourceLang: string | undefined | null): boolean {
  return languageProfile(sourceLang).enableStutterResolution;
}

const NAME_SEPARATOR_PATTERN = /[·・]/;
const TERM_BOUNDARY_LEFT = "(?<![A-Za-z0-9])";
const TERM_BOUNDARY_RIGHT = "(?![A-Za-z0-9])";

function termPattern(sourceTerm: string, global: boolean, caseSensitive: boolean): RegExp {
  const flags = (global ? "g" : "") + (caseSensitive ? "" : "i");
  return new RegExp(TERM_BOUNDARY_LEFT + escapeRegExp(sourceTerm) + TERM_BOUNDARY_RIGHT, flags);
}

export type Glossary = Record<string, string>;

export interface CompiledGlossaryTerm {
  sourceTerm: string;
  targetTerm: string;
  pattern: RegExp;
  stutterPattern: RegExp;
}

function stripLetterStutter(text: string): string {
  text = text.replace(STUTTER_WORD_PATTERN, "$1");
  return text.replace(STUTTER_PREFIX_PATTERN, "");
}

function isMusicSegment(text: string): boolean {
  return MUSIC_NOTE_PATTERN.test(text);
}

function musicContinuation(text: string): boolean {
  const remainder = text.replace(MUSIC_NOTE_PATTERN, "").trim();
  if (LEADING_ELLIPSIS_PATTERN.test(remainder)) return false;
  return firstLetterIsLower(remainder);
}

function stripEdgeNotes(text: string): string {
  return text.replace(EDGE_NOTE_PATTERN, "");
}

function firstLetterIsLower(text: string): boolean {
  text = text.replace(STYLE_TAG_LEADING_PATTERN, "");
  const match = LEADING_NON_LETTER_PATTERN.exec(text);
  const rest = text.slice(match ? match[0].length : 0);
  return Boolean(rest) && rest[0] === rest[0].toLowerCase() && rest[0] !== rest[0].toUpperCase();
}

const STYLE_TAG_JOIN_PATTERN = /<\/(i|b|u)>(\s*)<\1>/gi;

function collapseAdjacentStyleWraps(text: string): string {
  return text.replace(STYLE_TAG_JOIN_PATTERN, "$2");
}

function foldText(raw: string): string {
  const lines = raw.split("\n").map((rawLine) => stripTagsPreservingStyle(rawLine).replace(WHITESPACE_PATTERN, " ").trim());
  return collapseAdjacentStyleWraps(lines.filter(Boolean).join(" "));
}

function prepareCues(protocolCues: ProtocolCue[]): Cue[] {
  const cues: Cue[] = [];
  for (const raw of protocolCues) {
    const text = foldText(raw.text);
    if (text) cues.push({ id: raw.id, start_ms: raw.start_ms, end_ms: raw.end_ms, text });
  }
  return cues;
}

function splitDialogue(text: string): string[] {
  const matches = [...text.matchAll(DIALOGUE_DASH_PATTERN)];
  if (!matches.length) return [text];
  const segments: string[] = [];
  if (matches[0].index! > 0) segments.push(text.slice(0, matches[0].index!).trim());
  matches.forEach((match, idx) => {
    const end = idx + 1 < matches.length ? matches[idx + 1].index! : text.length;
    segments.push(text.slice(match.index! + match[0].length, end).trim());
  });
  const filtered = segments.filter(Boolean);
  return filtered.length ? filtered : [text];
}

function hasTerminalPunct(text: string): boolean {
  if (TRAILING_ELLIPSIS_PATTERN.test(text)) return false;
  if (TRAILING_CUTOFF_PATTERN.test(text)) return true;
  return TERMINAL_PUNCT_PATTERN.test(text);
}

function isShortReply(text: string, latinSource: boolean): boolean {
  if (latinSource) return (text.match(SHORT_REPLY_TOKEN_PATTERN) || []).length <= SHORT_REPLY_MAX_TOKENS;
  return text.trim().length <= SHORT_REPLY_MAX_TOKENS;
}

function updateQuoteState(text: string, isPending: boolean): boolean {
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (index === 0 && isPending) continue;
      isPending = !isPending;
    } else if (char === "\u201c" || char === "\u300c" || char === "\u00ab") {
      isPending = true;
    } else if (char === "\u201d" || char === "\u300d" || char === "\u00bb") {
      isPending = false;
    }
  }
  return isPending;
}

function isIsolatedShort(text: string, latinSource: boolean, isolatedMergeMaxWords: number): boolean {
  if (!isolatedMergeMaxWords) return false;
  if (latinSource) return (text.match(WORD_TOKEN_PATTERN) || []).length <= isolatedMergeMaxWords;
  return text.trim().length <= ISOLATED_MAX_CHARS_NON_LATIN;
}

interface Segment {
  cue_id: number;
  text: string;
  start_ms: number;
  end_ms: number;
  resolved: string | null;
  dash_index: number;
  style_wrap: "i" | "b" | "u" | null;
  marker_boundary?: boolean;
  merge_side?: "next" | "prev";
}

function assignMergeSides(segments: Segment[], latinSource: boolean, isolatedMergeMaxWords: number): Segment[] {
  segments.forEach((seg, i) => {
    if (seg.resolved || isMusicSegment(seg.text) || !isIsolatedShort(seg.text, latinSource, isolatedMergeMaxWords)) return;
    if (i + 1 < segments.length && !isMusicSegment(segments[i + 1].text)) {
      const gapNext = segments[i + 1].start_ms - seg.end_ms;
      if (gapNext <= SCENE_ADJACENCY_MS) {
        seg.merge_side = "next";
        return;
      }
    }
    if (i > 0 && !isMusicSegment(segments[i - 1].text)) {
      const gapPrev = seg.start_ms - segments[i - 1].end_ms;
      if (gapPrev <= SCENE_ADJACENCY_MS) seg.merge_side = "prev";
    }
  });
  return segments;
}

function mergeReason(prevSeg: Segment, currSeg: Segment, latinSource: boolean): "dash" | "gap" | "music" | "marker" | null {
  const prevIsMusic = isMusicSegment(prevSeg.text);
  const currIsMusic = isMusicSegment(currSeg.text);
  if (prevIsMusic !== currIsMusic) return null;
  if (prevSeg.cue_id === currSeg.cue_id) return isShortReply(currSeg.text, latinSource) ? "dash" : null;
  if (prevIsMusic && currIsMusic) return musicContinuation(currSeg.text) ? "music" : null;
  if (prevSeg.merge_side === "next" || currSeg.merge_side === "prev") return "marker";
  const gap = currSeg.start_ms - prevSeg.end_ms;
  if (TRAILING_SINGLE_CUTOFF_PATTERN.test(prevSeg.text) && !(gap <= GAP_THRESHOLD_MS && firstLetterIsLower(currSeg.text))) {
    return null;
  }
  if (hasTerminalPunct(prevSeg.text)) return null;
  return gap <= GAP_THRESHOLD_MS || firstLetterIsLower(currSeg.text) ? "gap" : null;
}

function findStutterResolution(text: string, compiledGlossary: CompiledGlossaryTerm[]): string | null {
  for (const { sourceTerm, targetTerm, stutterPattern } of compiledGlossary) {
    const match = stutterPattern.exec(text);
    if (!match) continue;
    const residual = (text.slice(0, match.index).match(STUTTER_RESIDUAL_PATTERN) || []).length +
      (text.slice(match.index + match[0].length).match(STUTTER_RESIDUAL_PATTERN) || []).length;
    const nameLength = (sourceTerm.match(STUTTER_RESIDUAL_PATTERN) || []).length;
    if (residual > 0 && residual < nameLength) {
      const trailing = TRAILING_MARK_PATTERN.exec(text);
      const suffix = trailing ? trailing[0].replace(/\?/g, "？").replace(/!/g, "！") : "";
      return targetTerm + suffix;
    }
  }
  return null;
}

function hasResidualText(text: string, latinSource: boolean): boolean {
  if (latinSource) return /[A-Za-z]/.test(text);
  return Boolean(text.trim());
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPureGlossaryLine(text: string, compiledGlossary: CompiledGlossaryTerm[], latinSource: boolean): string | null {
  let stripped = text;
  let matchedAny = false;
  for (const { pattern, stutterPattern } of compiledGlossary) {
    if (stutterPattern.test(stripped)) matchedAny = true;
    stripped = stripped.replace(pattern, "");
  }
  if (!matchedAny || hasResidualText(stripped, latinSource)) return null;
  let resolved = text;
  for (const { targetTerm, pattern } of compiledGlossary) {
    resolved = resolved.replace(pattern, targetTerm);
  }
  return resolved;
}

function buildSegments(cues: Cue[], compiledGlossary: CompiledGlossaryTerm[], latinSource: boolean, isolatedMergeMaxWords: number): Segment[] {
  const segments: Segment[] = [];
  for (const cue of cues) {
    const { text: workingText, styleWrap } = splitFullWrap(cue.text);
    splitDialogue(workingText).forEach((part, dashIndex) => {
      let resolved = findPureGlossaryLine(part, compiledGlossary, latinSource);
      if (!resolved && latinSource) resolved = findStutterResolution(part, compiledGlossary);
      const text = resolved || !latinSource ? part : stripLetterStutter(part);
      segments.push({ cue_id: cue.id, text, start_ms: cue.start_ms, end_ms: cue.end_ms, resolved, dash_index: dashIndex, style_wrap: styleWrap });
    });
  }
  return assignMergeSides(segments, latinSource, isolatedMergeMaxWords);
}

const QUOTE_PENDING_LIMIT = 10;

function groupSegments(segments: Segment[], latinSource: boolean): Segment[][] {
  const groups: Segment[][] = [];
  let current: Segment[] = [];
  let quotePending = false;
  let quoteSpan = 0;
  for (const seg of segments) {
    if (seg.resolved) {
      if (current.length) groups.push(current);
      current = [];
      groups.push([seg]);
      quotePending = false;
      quoteSpan = 0;
      continue;
    }
    let merged = false;
    if (current.length) {
      if (quotePending) {
        const gap = seg.start_ms - current[current.length - 1].end_ms;
        merged = gap <= SCENE_ADJACENCY_MS;
      }
      if (!merged) {
        const reason = mergeReason(current[current.length - 1], seg, latinSource);
        if (reason) {
          merged = true;
          if (reason === "marker" || reason === "dash") seg.marker_boundary = true;
        }
      }
    }
    if (merged) {
      current.push(seg);
    } else {
      if (current.length) groups.push(current);
      current = [seg];
      quotePending = false;
      quoteSpan = 0;
    }
    quotePending = updateQuoteState(seg.text, quotePending);
    if (quotePending) {
      quoteSpan += 1;
      if (quoteSpan >= QUOTE_PENDING_LIMIT) quotePending = false;
    } else {
      quoteSpan = 0;
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function splitNamePair(original: string, translated: string): [string, string][] {
  const origTokens = original.split(/\s+/).filter(Boolean);
  const transTokens = translated.split(NAME_SEPARATOR_PATTERN).filter(Boolean);
  const pairs: [string, string][] = [[original, translated]];
  if (origTokens.length >= 2 && origTokens.length === transTokens.length) {
    pairs.push([origTokens[0], transTokens[0]]);
  }
  return pairs;
}

function matchGlossaryTerms(text: string, compiledGlossary: CompiledGlossaryTerm[]) {
  const matches: { start: number; end: number; source: string; target: string }[] = [];
  const claimed: [number, number][] = [];
  for (const { sourceTerm, targetTerm, pattern } of compiledGlossary) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text))) {
      const start = m.index, end = m.index + m[0].length;
      if (claimed.some(([a, b]) => a < end && start < b)) continue;
      claimed.push([start, end]);
      matches.push({ start, end, source: sourceTerm, target: targetTerm });
    }
  }
  matches.sort((a, b) => a.start - b.start);
  return matches;
}

function joinGroupText(group: Segment[], spans: Span[], isMusicGroup: boolean): string {
  const pieces: string[] = [];
  group.forEach((seg, i) => {
    const piece = isMusicGroup ? stripEdgeNotes(seg.text) : seg.text;
    if (spans[i].boundary === "marker") {
      const marker = `${cueMarkerTag(spans[i].marker_id)} `;
      pieces.push(i > 0 ? ` ${marker}` : marker);
    } else if (i > 0) {
      pieces.push(" ");
    }
    pieces.push(piece);
  });
  return pieces.join("").trim();
}

function unitKind(group: Segment[]): "music" | "dialogue" {
  return group.some((seg) => isMusicSegment(seg.text)) ? "music" : "dialogue";
}

interface RawChapter {
  kind: "music" | "dialogue";
  groups: Segment[][];
}

function chapterize(groups: Segment[][], sceneChangeMs: number): RawChapter[] {
  const chapters: RawChapter[] = [];
  const openChapter: Record<string, RawChapter> = {};
  const threadEnd: Record<string, number> = {};
  for (const group of groups) {
    const kind = unitKind(group);
    const startMs = group[0].start_ms;
    const endMs = group[group.length - 1].end_ms;
    let chapter = openChapter[kind];
    if (!chapter || startMs - threadEnd[kind] > sceneChangeMs) {
      chapter = { kind, groups: [] };
      chapters.push(chapter);
      openChapter[kind] = chapter;
    }
    chapter.groups.push(group);
    threadEnd[kind] = endMs;
  }
  return chapters;
}

function buildUnits(cues: Cue[], compiledGlossary: CompiledGlossaryTerm[], latinSource: boolean, isolatedMergeMaxWords: number, sceneChangeMs: number) {
  const groups = groupSegments(buildSegments(cues, compiledGlossary, latinSource, isolatedMergeMaxWords), latinSource);
  const units: Unit[] = [];
  const chapters: Chapter[] = [];
  let markerMerges = 0;
  let unitId = 0;
  chapterize(groups, sceneChangeMs).forEach((rawChapter, chapterIndex) => {
    const isMusicChapter = rawChapter.kind === "music";
    const memberGroups = isMusicChapter ? [rawChapter.groups.flat()] : rawChapter.groups;
    const unitIds: number[] = [];
    for (const group of memberGroups) {
      unitId += 1;
      const spans: Span[] = group.map((s) => ({
        id: s.cue_id, start_ms: s.start_ms, end_ms: s.end_ms, text: s.text,
        boundary: isMusicChapter || s.marker_boundary ? "marker" : null,
        dash_index: s.dash_index || 0,
        style_wrap: s.style_wrap,
        kind: isMusicSegment(s.text) ? "music" : "dialogue",
        marker_id: undefined as unknown as string,
      }));
      assignMarkerIds(spans, "marker");
      markerMerges += group.filter((s) => s.marker_boundary).length;
      if (group.length === 1 && group[0].resolved) {
        units.push({ id: unitId, spans, text: "", term_matches: [], resolved: group[0].resolved });
      } else {
        const text = joinGroupText(group, spans, isMusicChapter);
        const matches = matchGlossaryTerms(text, compiledGlossary);
        units.push({ id: unitId, spans, text, term_matches: matches, resolved: null });
      }
      unitIds.push(unitId);
    }
    chapters.push({ id: chapterIndex + 1, kind: rawChapter.kind, unit_ids: unitIds });
  });
  return { units, chapters, markerMerges };
}

const DEFAULT_SCENE_CHANGE_SECONDS = 30;

export interface ExtractOptions {
  sourceLang?: string;
  targetLang?: string;
  isolatedMergeMaxWords?: number;
  sceneChangeSeconds?: number;
  caseSensitiveTerms?: boolean;
}

export function extract(protocolCues: ProtocolCue[], glossary: Glossary, options: ExtractOptions = {}) {
  const sourceLang = options.sourceLang ?? "en";
  const isolatedMergeMaxWords = options.isolatedMergeMaxWords ?? 0;
  const sceneChangeMs = (options.sceneChangeSeconds ?? DEFAULT_SCENE_CHANGE_SECONDS) * 1000;
  const caseSensitive = options.caseSensitiveTerms ?? false;
  const latinSource = isLatinSource(sourceLang);
  const cues = prepareCues(protocolCues);
  if (!cues.length) {
    return { success: false, cues: [], units: [], chapters: [], marker_merges: 0 };
  }
  const compiledGlossary: CompiledGlossaryTerm[] = Object.entries(glossary || {})
    .filter(([k]) => Boolean(k))
    .sort((a, b) => b[0].length - a[0].length)
    .map(([sourceTerm, targetTerm]) => ({
      sourceTerm,
      targetTerm,
      pattern: termPattern(sourceTerm, true, caseSensitive),
      stutterPattern: termPattern(sourceTerm, false, caseSensitive)
    }));

  const { units, chapters, markerMerges } = buildUnits(cues, compiledGlossary, latinSource, isolatedMergeMaxWords, sceneChangeMs);
  return { success: true, cues, units, chapters, marker_merges: markerMerges };
}
