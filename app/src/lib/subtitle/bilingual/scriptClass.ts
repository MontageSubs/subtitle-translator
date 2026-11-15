import { withoutEmbeddedAddresses } from "../../../utils/embeddedAddresses";

export type ScriptClass = "kana" | "han" | "hangul" | "latin" | "cyrillic" | "arabic" | "devanagari" | "hebrew" | "greek" | "thai" | "other";

const SCRIPT_PATTERNS: readonly (readonly [Exclude<ScriptClass, "other">, RegExp])[] = [
  ["kana", /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ["han", /\p{Script=Han}/u],
  ["hangul", /\p{Script=Hangul}/u],
  ["latin", /\p{Script=Latin}/u],
  ["cyrillic", /\p{Script=Cyrillic}/u],
  ["arabic", /\p{Script=Arabic}/u],
  ["devanagari", /\p{Script=Devanagari}/u],
  ["hebrew", /\p{Script=Hebrew}/u],
  ["greek", /\p{Script=Greek}/u],
  ["thai", /\p{Script=Thai}/u],
];

const LETTER = /\p{L}/u;
const NON_LATIN_WEIGHT = 3;

function classOf(character: string): ScriptClass | null {
  if (!LETTER.test(character)) return null;
  return SCRIPT_PATTERNS.find(([, pattern]) => pattern.test(character))?.[0] ?? "other";
}

function weightedScriptCounts(text: string): Map<ScriptClass, number> {
  const counts = new Map<ScriptClass, number>();
  for (const character of withoutEmbeddedAddresses(text)) {
    const script = classOf(character);
    if (script) counts.set(script, (counts.get(script) ?? 0) + (script === "latin" ? 1 : NON_LATIN_WEIGHT));
  }
  return counts;
}

export function scriptShare(text: string, script: ScriptClass, versus: ScriptClass): number | null {
  const counts = weightedScriptCounts(text);
  const own = counts.get(script) ?? 0;
  const total = own + (counts.get(versus) ?? 0);
  return total ? own / total : null;
}

export function dominantScript(text: string): ScriptClass | null {
  const counts = weightedScriptCounts(text);
  if (!counts.size) return null;
  if (counts.has("kana")) return "kana";
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}
