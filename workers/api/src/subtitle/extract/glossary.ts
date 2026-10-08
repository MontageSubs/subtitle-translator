import type { Glossary } from "../types";
import type { SourceRules } from "../languages/types";
import { escapeRegExp } from "../regex";
import { STYLE_CLOSE_ALT } from "./tagAlternations";

const TERM_BOUNDARY_LEFT = "(?<![A-Za-z0-9])";
const TERM_BOUNDARY_RIGHT = "(?![A-Za-z0-9])";
const STUTTER_RESIDUAL_PATTERN = /[A-Za-z]/g;
const TRAILING_MARK_PATTERN = new RegExp(`[!?…]+${STYLE_CLOSE_ALT}*$`, "i");

export interface CompiledGlossaryTerm {
  sourceTerm: string;
  sourceTermLower: string;
  targetTerm: string;
  caseSensitive: boolean;
  pattern: RegExp;
  stutterPattern: RegExp;
}

export function compileGlossary(glossary: Glossary, caseSensitive: boolean): CompiledGlossaryTerm[] {
  const body = (term: string) => TERM_BOUNDARY_LEFT + escapeRegExp(term) + TERM_BOUNDARY_RIGHT;
  const flags = caseSensitive ? "" : "i";
  return Object.entries(glossary || {})
    .filter(([sourceTerm]) => Boolean(sourceTerm))
    .sort((a, b) => b[0].length - a[0].length)
    .map(([sourceTerm, targetTerm]) => ({
      sourceTerm,
      sourceTermLower: sourceTerm.toLowerCase(),
      targetTerm,
      caseSensitive,
      pattern: new RegExp(body(sourceTerm), `g${flags}`),
      stutterPattern: new RegExp(body(sourceTerm), flags),
    }));
}

function termMayOccur(term: CompiledGlossaryTerm, haystack: string, haystackLower: string): boolean {
  return term.caseSensitive ? haystack.includes(term.sourceTerm) : haystackLower.includes(term.sourceTermLower);
}

const countLetters = (text: string): number => (text.match(STUTTER_RESIDUAL_PATTERN) || []).length;

export function findStutterResolution(text: string, glossary: CompiledGlossaryTerm[]): string | null {
  const textLower = text.toLowerCase();
  for (const term of glossary) {
    if (!termMayOccur(term, text, textLower)) continue;
    const match = term.stutterPattern.exec(text);
    if (!match) continue;
    const residual = countLetters(text.slice(0, match.index)) + countLetters(text.slice(match.index + match[0].length));
    if (residual > 0 && residual < countLetters(term.sourceTerm)) {
      const trailing = TRAILING_MARK_PATTERN.exec(text);
      const suffix = trailing ? trailing[0].replace(/\?/g, "？").replace(/!/g, "！") : "";
      return term.targetTerm + suffix;
    }
  }
  return null;
}

export function findPureGlossaryLine(text: string, glossary: CompiledGlossaryTerm[], rules: SourceRules): string | null {
  let stripped = text;
  let strippedLower = text.toLowerCase();
  let matchedAny = false;
  for (const term of glossary) {
    if (!termMayOccur(term, stripped, strippedLower)) continue;
    if (term.stutterPattern.test(stripped)) matchedAny = true;
    const next = stripped.replace(term.pattern, "");
    if (next !== stripped) {
      stripped = next;
      strippedLower = stripped.toLowerCase();
    }
  }
  if (!matchedAny || rules.hasResidualText(stripped)) return null;
  let resolved = text;
  let resolvedLower = text.toLowerCase();
  for (const term of glossary) {
    if (!termMayOccur(term, resolved, resolvedLower)) continue;
    const next = resolved.replace(term.pattern, term.targetTerm);
    if (next !== resolved) {
      resolved = next;
      resolvedLower = resolved.toLowerCase();
    }
  }
  return resolved;
}

export function matchGlossaryTerms(text: string, glossary: CompiledGlossaryTerm[]) {
  const matches: { start: number; end: number; source: string; target: string }[] = [];
  const claimed: [number, number][] = [];
  for (const { sourceTerm, targetTerm, pattern } of glossary) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      if (claimed.some(([a, b]) => a < end && start < b)) continue;
      claimed.push([start, end]);
      matches.push({ start, end, source: sourceTerm, target: targetTerm });
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}
