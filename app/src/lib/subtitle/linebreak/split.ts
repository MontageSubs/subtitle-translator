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
const TERMINAL_PUNCT_PATTERN = /(?:\.{2,}|[.…‥。۔?!？！؟‽])['"”’»›」』）\)\}\]】]*$/u;
const CLAUSE_PUNCT_PATTERN = /[:;：；؛—–]['"”’»›」』）\)\}\]】]*$/u;
const MINOR_PUNCT_PATTERN = /[,，、،]['"”’»›」』）\)\}\]】]*$/u;
const ABBREVIATION_PATTERN = /(?:^|\s)(?:[A-Za-z]{1,3}\.|[A-Z][a-z]{1,4}\.|etc\.|vs\.|e\.g\.|i\.e\.|approx\.|dept\.|fig\.|gen\.|gov\.|inc\.|jr\.|sr\.|ltd\.|st\.|vol\.)['"”’»›」』）\)\}\]】]*$/i;
const ATTACHED_CLOSING_PATTERN = /^['"”’»›」』）\)\}\]】]/;

function isChineseOrYue(langCode: string): boolean {
  const code = (langCode || "").toLowerCase().trim();
  return code.startsWith("zh") || code.startsWith("yue") || code === "cantonese";
}

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
  isCjk: boolean,
  isZhOrYue: boolean,
  isSpaceBoundary: boolean
): number {
  let score = Math.abs(offset - totalLength / 2) + Math.abs(line1.length - line2.length) * 0.5;

  const isTerminalPunct = TERMINAL_PUNCT_PATTERN.test(line1) && !ABBREVIATION_PATTERN.test(line1);

  if (!isTerminalPunct && !(isZhOrYue && isSpaceBoundary) && line1.length > line2.length * 1.35) {
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
    if (line1Units < 2 || line2Units < 2) {
      score += 150;
    } else if (line1Units < 3 || line2Units < 3) {
      score += isTerminalPunct || (isZhOrYue && isSpaceBoundary) ? 20 : 75;
    }
  } else {
    if (line1Units <= 1 || line1.length < 4 || line2Units <= 1 || line2.length < 4) {
      score += 75;
    }
  }

  if (isTerminalPunct) {
    score -= 95;
  } else if (CLAUSE_PUNCT_PATTERN.test(line1)) {
    score -= 50;
  } else if (MINOR_PUNCT_PATTERN.test(line1)) {
    score -= 30;
  } else if (isZhOrYue && isSpaceBoundary) {
    score -= 65;
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
  const isZhOrYue = isChineseOrYue(langCode);
  const candidates: BreakCandidate[] = [];
  let offset = 0;
  let lastWord = "";

  for (let i = 0; i < tokens.length - 1; i++) {
    const currentToken = tokens[i];
    offset += currentToken.text.length;
    if (currentToken.isWordLike) {
      lastWord = currentToken.text.toLowerCase();
    }

    if (ATTACHED_CLOSING_PATTERN.test(text.slice(offset))) {
      continue;
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

    const isSpaceBoundary = /\s/.test(text.slice(line1.length, text.length - line2.length));
    const score = evaluateCandidate(
      offset,
      text.length,
      line1,
      line2,
      lastWord,
      nextWord,
      rule,
      isCjk,
      isZhOrYue,
      isSpaceBoundary
    );
    candidates.push({ offset, line1, line2, score });
  }

  if (!candidates.length) return null;

  const best = candidates.reduce((min, candidate) => (candidate.score < min.score ? candidate : min));
  return `${best.line1}\n${best.line2}`;
}
