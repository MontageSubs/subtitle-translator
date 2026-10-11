import type { Glossary } from "../types";
import type { SourceRules } from "../languages/types";
import { escapeRegExp } from "../regex";
import { STYLE_CLOSE_ALT } from "../common/markup";

const TERM_BOUNDARY_LEFT = "(?<![A-Za-z0-9])";
const TERM_BOUNDARY_RIGHT = "(?![A-Za-z0-9])";
const STUTTER_RESIDUAL_PATTERN = /[A-Za-z]/g;
const TRAILING_MARK_PATTERN = new RegExp(`[!?…]+${STYLE_CLOSE_ALT}*$`, "i");

const TERM_BLOCK_SIZE = 16;

export interface CompiledGlossaryTerm {
  sourceTerm: string;
  sourceTermLower: string;
  targetTerm: string;
  caseSensitive: boolean;
  pattern: RegExp;
  stutterPattern: RegExp;
}

interface TermBlock {
  gate: RegExp;
  terms: CompiledGlossaryTerm[];
}

export interface CompiledGlossary {
  terms: CompiledGlossaryTerm[];
  any: RegExp | null;
  blocks: TermBlock[];
}

const occurrenceGate = (terms: readonly CompiledGlossaryTerm[], flags: string): RegExp => new RegExp(terms.map((term) => escapeRegExp(term.sourceTerm)).join("|"), flags);

export function compileGlossary(glossary: Glossary, caseSensitive: boolean): CompiledGlossary {
  const body = (term: string) => TERM_BOUNDARY_LEFT + escapeRegExp(term) + TERM_BOUNDARY_RIGHT;
  const flags = caseSensitive ? "" : "i";
  const terms = Object.entries(glossary || {})
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
  const blocks: TermBlock[] = [];
  for (let start = 0; start < terms.length; start += TERM_BLOCK_SIZE) {
    const members = terms.slice(start, start + TERM_BLOCK_SIZE);
    blocks.push({ gate: occurrenceGate(members, flags), terms: members });
  }
  return { terms, any: terms.length ? occurrenceGate(terms, flags) : null, blocks };
}

function termMayOccur(term: CompiledGlossaryTerm, haystack: string, haystackLower: string): boolean {
  return term.caseSensitive ? haystack.includes(term.sourceTerm) : haystackLower.includes(term.sourceTermLower);
}

const countLetters = (text: string): number => (text.match(STUTTER_RESIDUAL_PATTERN) || []).length;

export function findStutterResolution(text: string, glossary: CompiledGlossary): string | null {
  if (!glossary.any?.test(text)) return null;
  const textLower = text.toLowerCase();
  for (const block of glossary.blocks) {
    if (!block.gate.test(text)) continue;
    for (const term of block.terms) {
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
  }
  return null;
}

function rewriteTerms(text: string, glossary: CompiledGlossary, replacement: (term: CompiledGlossaryTerm) => string): string {
  let current = text;
  let currentLower = text.toLowerCase();
  for (const block of glossary.blocks) {
    if (!block.gate.test(current)) continue;
    for (const term of block.terms) {
      if (!termMayOccur(term, current, currentLower)) continue;
      const next = current.replace(term.pattern, replacement(term));
      if (next !== current) {
        current = next;
        currentLower = current.toLowerCase();
      }
    }
  }
  return current;
}

export function findPureGlossaryLine(text: string, glossary: CompiledGlossary, rules: SourceRules): string | null {
  if (!glossary.any?.test(text)) return null;
  const stripped = rewriteTerms(text, glossary, () => "");
  return stripped === text || rules.hasResidualText(stripped) ? null : rewriteTerms(text, glossary, (term) => term.targetTerm);
}

export function matchGlossaryTerms(text: string, glossary: CompiledGlossary) {
  const matches: { start: number; end: number; source: string; target: string }[] = [];
  if (!glossary.any?.test(text)) return matches;
  const claimed: [number, number][] = [];
  for (const block of glossary.blocks) {
    if (!block.gate.test(text)) continue;
    for (const { sourceTerm, targetTerm, pattern } of block.terms) {
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
  }
  return matches.sort((a, b) => a.start - b.start);
}
