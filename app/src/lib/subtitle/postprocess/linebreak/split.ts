import { targetRulesFor } from "../../language/resolve";
import { segmentTokens, Token } from "./segment";
import { cutMarked, separateMarkup } from "./inlineMarkup";
import { buildProtection } from "./protectedSpans";

interface BreakOption {
  offset: number;
  score: number;
  splitsClitic: boolean;
}

const ATTACHED_CLOSING_PATTERN = /^['"”’»›」』）\)\}\]】]/;

function nextWordAfter(tokens: Token[], index: number): string {
  const next = tokens.slice(index + 1).find((token) => token.isWordLike);
  return next ? next.text.toLowerCase() : "";
}

export function splitIntoTwoLines(text: string, langCode: string): string | null {
  const { lineBreak } = targetRulesFor(langCode);
  const { rule } = lineBreak;
  const marked = separateMarkup(text);
  const visible = marked.visible;
  const tokens = segmentTokens(visible, langCode);
  if (tokens.length < 2) return null;
  const protection = buildProtection(marked);

  const options: BreakOption[] = [];
  let offset = 0;
  let lastWord = "";

  for (let i = 0; i < tokens.length - 1; i++) {
    offset += tokens[i].text.length;
    if (tokens[i].isWordLike) lastWord = tokens[i].text.toLowerCase();

    const rest = visible.slice(offset);
    if (ATTACHED_CLOSING_PATTERN.test(rest) || protection.forbids(offset)) continue;

    const line1 = visible.slice(0, offset).trimEnd();
    const line2 = rest.trimStart();
    if (!line1 || !line2) continue;
    if (rule.noLineStart.has(line2[0]) || rule.noLineEnd.has(line1[line1.length - 1])) continue;

    const nextWord = nextWordAfter(tokens, i);
    const score =
      lineBreak.score({
        offset,
        totalLength: visible.length,
        line1,
        line2,
        lastWord,
        nextWord,
        isSpaceBoundary: /\s/.test(visible.slice(line1.length, visible.length - line2.length)),
      }) + protection.penaltyAt(offset);
    const splitsClitic = rule.enclitics.has(nextWord) || rule.proclitics.has(lastWord) || rule.conjunctions.has(lastWord);
    options.push({ offset, score, splitsClitic });
  }

  const allowed = lineBreak.enforcesClitics ? options.filter((option) => !option.splitsClitic) : options;
  const best = (allowed.length ? allowed : options).reduce<BreakOption | null>((top, option) => (!top || option.score < top.score ? option : top), null);
  if (!best) return null;
  const lineEnd = visible.slice(0, best.offset).trimEnd().length;
  const nextStart = visible.length - visible.slice(best.offset).trimStart().length;
  const [first, second] = cutMarked(marked, lineEnd, nextStart);
  return `${first}\n${second}`;
}
