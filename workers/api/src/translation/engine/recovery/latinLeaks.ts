import type { Unit } from "../../../subtitle/types";
import { cuesOfUnitIds } from "../cueIds";
import { scriptOf } from "../../../subtitle/common/languageCodes";
import { scriptLeakPattern } from "../../../subtitle/languages/scripts";
import { dispatchPayloads } from "../dispatch";
import type { UnitTranslations } from "../../types";
import { routeFor, type EngineSession } from "../session";
import { escapeHtml } from "../text";

const MARKUP_SOURCE = "<\\/?[A-Za-z][^<>]*>|\\{\\\\[^{}]*\\}|\\u27e6[^\\u27e6\\u27e7]*\\u27e7";
const LATIN_WORD_OUTSIDE_MARKUP = new RegExp(`(?:${MARKUP_SOURCE})|(${scriptLeakPattern("latin").source})`, "g");
const NO_WORDS: ReadonlySet<string> = new Set();

function* latinWordsOutsideMarkup(text: string): Generator<string> {
  for (const match of text.matchAll(LATIN_WORD_OUTSIDE_MARKUP)) if (match[1]) yield match[1];
}

function forcedTermWords(unit: Unit): ReadonlySet<string> {
  if (!unit.term_matches.length) return NO_WORDS;
  const words = new Set<string>();
  for (const { target } of unit.term_matches) for (const word of latinWordsOutsideMarkup(target)) words.add(word);
  return words;
}

const substituteLatinWords = (text: string, replacements: ReadonlyMap<string, string>): string =>
  text.replace(LATIN_WORD_OUTSIDE_MARKUP, (whole, word?: string) => (word ? replacements.get(word) ?? whole : whole));

export async function repairLatinWordLeaks(session: EngineSession, results: UnitTranslations): Promise<void> {
  const { source, targetLang, dialect, unitById } = session;
  if (session.budget.exhausted || scriptOf(source.current) !== "latin" || scriptOf(targetLang) !== "cjk") return;

  const leaksByUnit = new Map<number, string[]>();
  for (const [id, text] of results) {
    if (!text) continue;
    const forced = forcedTermWords(unitById.get(id)!);
    const words = [...latinWordsOutsideMarkup(text)].filter((word) => !forced.has(word));
    if (words.length) leaksByUnit.set(id, words);
  }
  if (!leaksByUnit.size) return;

  const words = [...new Set([...leaksByUnit.values()].flat())].sort();
  const flats = await dispatchPayloads(session, words.map((word) => dialect.wrap(escapeHtml(word))), routeFor(session));
  const translated = new Map<string, string>();
  words.forEach((word, i) => {
    const text = flats[i] ? dialect.restore(flats[i]!) : "";
    if (text && !latinWordsOutsideMarkup(text).next().value) translated.set(word, text);
  });
  if (!translated.size) return;

  const repaired: number[] = [];
  for (const [id, leaked] of leaksByUnit) {
    const replacements = new Map<string, string>();
    for (const word of leaked) if (translated.has(word)) replacements.set(word, translated.get(word)!);
    if (!replacements.size) continue;
    results.set(id, substituteLatinWords(results.get(id)!, replacements));
    repaired.push(id);
  }
  if (repaired.length) session.trace?.repair("latin", cuesOfUnitIds(unitById, repaired), translated.size);
}
