import { LineBreakRule, languageBreakRule } from "./rules";
import { segmentTokens } from "./segment";

function candidateBreaks(text: string, langCode: string, rule: LineBreakRule): number[] {
  const tokens = segmentTokens(text, langCode);
  const points: number[] = [];
  let offset = 0;
  let lastWord = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    offset += token.text.length;
    if (token.isWordLike) lastWord = token.text.toLowerCase();
    if (i === tokens.length - 1) continue;
    const nextChar = text[offset];
    const prevChar = text[offset - 1];
    if (nextChar && rule.noLineStart.has(nextChar)) continue;
    if (prevChar && rule.noLineEnd.has(prevChar)) continue;
    if (rule.avoidTrailing.has(lastWord)) continue;
    points.push(offset);
  }
  return points;
}

function bestSplitPoint(points: number[], total: number): number | null {
  if (!points.length) return null;
  const target = total / 2;
  return points.reduce((best, point) => (Math.abs(point - target) < Math.abs(best - target) ? point : best));
}

export function splitIntoTwoLines(text: string, langCode: string): string | null {
  const rule = languageBreakRule(langCode.split("-")[0].toLowerCase());
  const points = candidateBreaks(text, langCode, rule);
  const splitAt = bestSplitPoint(points, text.length);
  if (splitAt === null) return null;
  const first = text.slice(0, splitAt).trimEnd();
  const second = text.slice(splitAt).trimStart();
  if (!first || !second) return null;
  return `${first}\n${second}`;
}
