import { OrthographyRule } from "./types";
import { languageBreakRule } from "./rules";
import { segmentTokens } from "./segment";

interface BreakCandidate {
  offset: number;
  line1: string;
  line2: string;
  score: number;
}

const CJK_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function countUnits(text: string, isCjk: boolean): number {
  const pattern = isCjk ? /[\p{L}\p{N}]/gu : /[\p{L}\p{N}]+/gu;
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function evaluateCandidate(
  offset: number,
  totalLength: number,
  line1: string,
  line2: string,
  lastWord: string,
  nextWord: string,
  rule: OrthographyRule,
  isCjk: boolean
): number {
  let score = Math.abs(offset - totalLength / 2) + Math.abs(line1.length - line2.length) * 0.5;

  if (line1.length > line2.length * 1.35) {
    score += 15;
  }

  if (rule.proclitics.has(lastWord)) {
    score += 70;
  }

  if (!isCjk && lastWord.length === 1 && /^\p{L}$/u.test(lastWord)) {
    score += 60;
  }

  if (rule.enclitics.has(nextWord)) {
    score += 70;
  }

  if (/\d+$/.test(line1) && /^(%|‰|[a-zA-Z]{1,4}|[\p{Script=Han}])/u.test(nextWord)) {
    score += 60;
  }

  const line1Units = countUnits(line1, isCjk);
  const line2Units = countUnits(line2, isCjk);

  if (isCjk) {
    if (line1Units < 3 || line2Units < 3) {
      score += 75;
    }
  } else {
    if (line1Units <= 1 || line1.length < 5 || line2Units <= 1 || line2.length < 5) {
      score += 75;
    }
  }

  const lastChar = line1[line1.length - 1];
  if (lastChar && /[,;:\u2014\u2013\u3001\uff0c\uff1b\uff1a]/.test(lastChar)) {
    score -= 35;
  }

  if (rule.conjunctions.has(nextWord)) {
    score -= 25;
  }

  return score;
}

export function splitIntoTwoLines(text: string, langCode: string): string | null {
  const rule = languageBreakRule(langCode);
  const tokens = segmentTokens(text, langCode);
  if (tokens.length < 2) return null;

  const isCjk = CJK_REGEX.test(text);
  const candidates: BreakCandidate[] = [];
  let offset = 0;
  let lastWord = "";

  for (let i = 0; i < tokens.length - 1; i++) {
    const currentToken = tokens[i];
    offset += currentToken.text.length;
    if (currentToken.isWordLike) {
      lastWord = currentToken.text.toLowerCase();
    }

    const line1 = text.slice(0, offset).trimEnd();
    const line2 = text.slice(offset).trimStart();
    if (!line1 || !line2) continue;

    const firstCharOfLine2 = line2[0];
    const lastCharOfLine1 = line1[line1.length - 1];
    if (firstCharOfLine2 && rule.noLineStart.has(firstCharOfLine2)) continue;
    if (lastCharOfLine1 && rule.noLineEnd.has(lastCharOfLine1)) continue;

    let nextWord = "";
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j].isWordLike) {
        nextWord = tokens[j].text.toLowerCase();
        break;
      }
    }

    const score = evaluateCandidate(offset, text.length, line1, line2, lastWord, nextWord, rule, isCjk);
    candidates.push({ offset, line1, line2, score });
  }

  if (!candidates.length) return null;

  const best = candidates.reduce((min, candidate) => (candidate.score < min.score ? candidate : min));
  return `${best.line1}\n${best.line2}`;
}
