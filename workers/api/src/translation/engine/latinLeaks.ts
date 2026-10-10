import { scriptOf } from "../../subtitle/common/languageCodes";
import { scriptLeakPattern } from "../../subtitle/languages/scripts";
import { dispatchPayloads } from "./dispatch";
import type { UnitTranslations } from "./input";
import { routeFor, type EngineSession } from "./session";
import { escapeHtml } from "./text";

const latinWordsIn = (text: string): string[] => text.match(scriptLeakPattern("latin")) ?? [];

export async function repairLatinWordLeaks(session: EngineSession, results: UnitTranslations): Promise<void> {
  const { source, targetLang, dialect } = session;
  if (session.budget.exhausted || scriptOf(source.current) !== "latin" || scriptOf(targetLang) !== "cjk") return;

  const leaksByUnit = new Map<number, string[]>();
  for (const [id, text] of results) {
    const words = text ? latinWordsIn(text) : [];
    if (words.length) leaksByUnit.set(id, words);
  }
  if (!leaksByUnit.size) return;

  const words = [...new Set([...leaksByUnit.values()].flat())].sort();
  const flats = await dispatchPayloads(session, words.map((word) => dialect.wrap(escapeHtml(word))), routeFor(session));
  const translated = new Map<string, string>();
  words.forEach((word, i) => {
    const text = flats[i] ? dialect.restore(flats[i]!) : "";
    if (text && !latinWordsIn(text).length) translated.set(word, text);
  });
  if (!translated.size) return;

  for (const [id, leaked] of leaksByUnit) {
    let text = results.get(id)!;
    for (const word of new Set(leaked)) {
      const replacement = translated.get(word);
      if (replacement) text = text.split(word).join(replacement);
    }
    results.set(id, text);
  }
  session.log(`latin-word leak repair: translated ${translated.size} residual word(s) across ${leaksByUnit.size} unit(s)`);
}
