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

function scriptCounts(text: string): Map<ScriptClass, number> {
  const counts = new Map<ScriptClass, number>();
  for (const character of text) {
    const script = classOf(character);
    if (script) counts.set(script, (counts.get(script) ?? 0) + 1);
  }
  return counts;
}

const NON_LATIN_WEIGHT = 3;

export function closestScript(text: string, candidates: readonly (ScriptClass | null)[]): ScriptClass | null {
  const counts = scriptCounts(text);
  let best: ScriptClass | null = null;
  let bestWeight = 0;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const weight = (counts.get(candidate) ?? 0) * (candidate === "latin" ? 1 : NON_LATIN_WEIGHT);
    if (weight > bestWeight) {
      best = candidate;
      bestWeight = weight;
    }
  }
  return best;
}

export function dominantScript(text: string): ScriptClass | null {
  const counts = scriptCounts(text);
  if (!counts.size) return null;
  if (counts.has("kana")) return "kana";
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}
