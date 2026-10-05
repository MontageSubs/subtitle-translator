import { resolveLanguage } from "../../language/resolve";
import { segmentTokens, Token } from "./segment";

interface BreakOption {
  line1: string;
  line2: string;
  score: number;
}

const ATTACHED_CLOSING_PATTERN = /^['"”’»›」』）\)\}\]】]/;

function nextWordAfter(tokens: Token[], index: number): string {
  const next = tokens.slice(index + 1).find((token) => token.isWordLike);
  return next ? next.text.toLowerCase() : "";
}

export function splitIntoTwoLines(text: string, langCode: string): string | null {
  const { lineBreak } = resolveLanguage(langCode);
  const { rule } = lineBreak;
  const tokens = segmentTokens(text, langCode);
  if (tokens.length < 2) return null;

  let best: BreakOption | null = null;
  let offset = 0;
  let lastWord = "";

  for (let i = 0; i < tokens.length - 1; i++) {
    offset += tokens[i].text.length;
    if (tokens[i].isWordLike) lastWord = tokens[i].text.toLowerCase();

    const rest = text.slice(offset);
    if (ATTACHED_CLOSING_PATTERN.test(rest)) continue;

    const line1 = text.slice(0, offset).trimEnd();
    const line2 = rest.trimStart();
    if (!line1 || !line2) continue;
    if (rule.noLineStart.has(line2[0]) || rule.noLineEnd.has(line1[line1.length - 1])) continue;

    const score = lineBreak.score({
      offset,
      totalLength: text.length,
      line1,
      line2,
      lastWord,
      nextWord: nextWordAfter(tokens, i),
      isSpaceBoundary: /\s/.test(text.slice(line1.length, text.length - line2.length)),
    });
    if (!best || score < best.score) best = { line1, line2, score };
  }

  return best ? `${best.line1}\n${best.line2}` : null;
}
