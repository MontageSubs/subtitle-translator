import { isCjkLanguage } from "../../../utils/languageProfiles";
import { LineBreakRule, languageBreakRule } from "./rules";
import { segmentTokens } from "./segment";

function candidateCjkBreaks(text: string, rule: LineBreakRule): number[] {
  const points: number[] = [];
  let offset = 0;
  for (let i = 0; i < text.length - 1; i++) {
    offset += 1;
    const before = text[i];
    const after = text[i + 1];
    if (rule.noLineEnd.has(before) || rule.noLineStart.has(after)) continue;
    points.push(offset);
  }
  return points;
}

function candidateWordBreaks(text: string, langCode: string, rule: LineBreakRule): number[] {
  const tokens = segmentTokens(text, langCode);
  const points: number[] = [];
  let offset = 0;
  let lastWord = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    offset += token.text.length;
    if (token.isWordLike) {
      lastWord = token.text.toLowerCase();
      continue;
    }
    if (!/^\s+$/.test(token.text) || i === tokens.length - 1) continue;
    if (rule.avoidTrailing.has(lastWord)) continue;
    const nextChar = text[offset];
    if (nextChar && rule.noLineStart.has(nextChar)) continue;
    const prevChar = text[offset - token.text.length - 1];
    if (prevChar && rule.noLineEnd.has(prevChar)) continue;
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
  const cjk = isCjkLanguage(langCode);
  const rule = languageBreakRule(langCode.split("-")[0].toLowerCase());
  const points = cjk ? candidateCjkBreaks(text, rule) : candidateWordBreaks(text, langCode, rule);
  const splitAt = bestSplitPoint(points, text.length);
  if (splitAt === null) return null;
  const first = text.slice(0, splitAt).trimEnd();
  const second = text.slice(splitAt).trimStart();
  if (!first || !second) return null;
  return `${first}\n${second}`;
}
