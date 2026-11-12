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

function classOf(character: string): ScriptClass | null {
  if (!LETTER.test(character)) return null;
  return SCRIPT_PATTERNS.find(([, pattern]) => pattern.test(character))?.[0] ?? "other";
}

export function dominantScript(text: string): ScriptClass | null {
  const counts = new Map<ScriptClass, number>();
  for (const character of text) {
    const script = classOf(character);
    if (script) counts.set(script, (counts.get(script) ?? 0) + 1);
  }
  if (!counts.size) return null;
  if (counts.has("kana")) return "kana";
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}
