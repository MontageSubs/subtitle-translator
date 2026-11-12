import type { AssTag, Cue } from "../types";
import { dominantScript, ScriptClass } from "./scriptClass";

export interface StackedSplit {
  first: Cue;
  second: Cue;
}

const STYLE_RESET_PATTERN = /\\r[^\\}]*/g;

function sliceTags(tags: AssTag[] | undefined, from: number, to: number, dropStyleResets: boolean): AssTag[] | undefined {
  const kept = (tags ?? []).flatMap(([offset, tag]): AssTag[] => {
    if (offset < from || offset >= to) return [];
    const cleaned = dropStyleResets ? tag.replace(STYLE_RESET_PATTERN, "") : tag;
    return cleaned ? [[offset - from, cleaned]] : [];
  });
  return kept.length ? kept : undefined;
}

function lineBoundary(lines: readonly string[]): number | null {
  if (lines.length === 2) return 1;
  const scripts: (ScriptClass | null)[] = [];
  for (const line of lines) scripts.push(dominantScript(line) ?? scripts[scripts.length - 1] ?? null);
  const changes = scripts.flatMap((script, index) => (index > 0 && script !== scripts[index - 1] ? [index] : []));
  if (changes.length === 1) return changes[0];
  return lines.length % 2 === 0 ? lines.length / 2 : null;
}

export function splitStackedCue(cue: Cue): StackedSplit | null {
  const lines = cue.text.split("\n");
  if (lines.length < 2) return null;
  const boundary = lineBoundary(lines);
  if (boundary === null) return null;
  const firstText = lines.slice(0, boundary).join("\n");
  const secondText = lines.slice(boundary).join("\n");
  if (!firstText.trim() || !secondText.trim()) return null;
  const secondStart = firstText.length + 1;
  return {
    first: { ...cue, text: firstText, assTags: sliceTags(cue.assTags, 0, secondStart, false), leadingBlocks: undefined, trailingBlocks: undefined },
    second: { ...cue, text: secondText, assTags: sliceTags(cue.assTags, secondStart, cue.text.length + 1, true), assHeader: undefined, vttHeader: undefined, leadingBlocks: undefined, trailingBlocks: undefined },
  };
}
