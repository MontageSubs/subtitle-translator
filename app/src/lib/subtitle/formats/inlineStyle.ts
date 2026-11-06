import type { Cue } from '../types';

type StyleFlag = "b" | "i" | "u" | "s";

const STYLE_FLAGS: readonly StyleFlag[] = ["b", "i", "u", "s"];
const ASS_FLAG_PATTERN = /\\([bius])(\d+)/g;
const HTML_FLAG_PATTERN = /<(\/?)([bius])>/gi;

type StyleState = Record<StyleFlag, boolean>;

const openTag = (flag: StyleFlag): string => `<${flag}>`;
const closeTag = (flag: StyleFlag): string => `</${flag}>`;

function applyFlags(state: StyleState, tags: string): StyleFlag[] {
  const changed: StyleFlag[] = [];
  for (const [, flag, value] of tags.matchAll(ASS_FLAG_PATTERN)) {
    const next = Number(value) !== 0;
    if (state[flag as StyleFlag] === next) continue;
    state[flag as StyleFlag] = next;
    changed.push(flag as StyleFlag);
  }
  return changed;
}

const freshState = (): StyleState => ({ b: false, i: false, u: false, s: false });

export function htmlStyledText(text: string, original: Cue | undefined): string {
  if (original?.text !== text || !original.assTags?.length) return text;
  const state = freshState();
  let cursor = 0;
  let markup = "";
  for (const [offset, tags] of original.assTags) {
    markup += text.slice(cursor, offset);
    cursor = offset;
    for (const flag of applyFlags(state, tags)) markup += state[flag] ? openTag(flag) : closeTag(flag);
  }
  markup += text.slice(cursor);
  return STYLE_FLAGS.filter((flag) => state[flag]).reduce((result, flag) => `${result}${closeTag(flag)}`, markup);
}

function wholeLineStyles(original: Cue | undefined): StyleFlag[] {
  if (!original?.assTags?.length) return [];
  const state = freshState();
  const leading = freshState();
  const interrupted = new Set<StyleFlag>();
  for (const [offset, tags] of original.assTags) {
    const changed = applyFlags(state, tags);
    if (offset === 0) applyFlags(leading, tags);
    else if (offset < original.text.length) changed.forEach((flag) => interrupted.add(flag));
  }
  return STYLE_FLAGS.filter((flag) => leading[flag] && !interrupted.has(flag));
}

export function wrapWholeLine(text: string, original: Cue | undefined): string {
  const flags = text ? wholeLineStyles(original) : [];
  return flags.reduce((result, flag) => `${openTag(flag)}${result}${closeTag(flag)}`, text);
}

export function assStyledText(text: string): string {
  return text.replace(HTML_FLAG_PATTERN, (_, closing: string, flag: string) => `{\\${flag.toLowerCase()}${closing ? 0 : 1}}`);
}

export function assWholeLineFlags(original: Cue | undefined): string {
  const flags = wholeLineStyles(original);
  return flags.length ? `{${flags.map((flag) => `\\${flag}1`).join("")}}` : "";
}
