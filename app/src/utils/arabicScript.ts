const COMBINING_MARKS_AND_JOINERS = /[\u064B-\u065F\u0670\u0640\u200C\u200D]/g;
const PERSIAN_DIGIT_OFFSET = 0x06f0;
const ARABIC_INDIC_DIGIT_OFFSET = 0x0660;
const LETTER_FOLDS: Readonly<Record<string, string>> = { ي: "ی", ى: "ی", ك: "ک", ة: "ه", أ: "ا", إ: "ا", ٱ: "ا", آ: "ا", ۀ: "ه", ہ: "ه", ھ: "ه", ۃ: "ه", ے: "ی", ں: "ن" };
const FOLDED_LETTERS = new RegExp(`[${Object.keys(LETTER_FOLDS).join("")}]`, "g");

export const containsArabicScript = (text: string): boolean => /[\u0600-\u06FF]/.test(text);

export type KeyboardLayout = Readonly<Record<string, string>>;

interface LayoutMatchers {
  readonly scriptByLatinKey: KeyboardLayout;
  readonly latinByScriptKey: KeyboardLayout;
  readonly latinKeys: RegExp;
  readonly scriptKeys: RegExp;
}

const matchersByLayout = new WeakMap<KeyboardLayout, LayoutMatchers>();

const escapeForClass = (characters: Iterable<string>): string => [...characters].map((character) => `\\${character}`.replace(/^\\([\p{L}\p{N}])/u, "$1")).join("");

function matchersFor(layout: KeyboardLayout): LayoutMatchers {
  const cached = matchersByLayout.get(layout);
  if (cached) return cached;
  const singleCharacterEntries = Object.entries(layout).filter(([, script]) => [...script].length === 1);
  const matchers: LayoutMatchers = {
    scriptByLatinKey: layout,
    latinByScriptKey: Object.fromEntries(singleCharacterEntries.map(([latin, script]) => [script, latin])),
    latinKeys: new RegExp(`^[${escapeForClass(Object.keys(layout))}]+$`),
    scriptKeys: new RegExp(`^[${escapeForClass(singleCharacterEntries.map(([, script]) => script))}\\u200c\\s]+$`),
  };
  matchersByLayout.set(layout, matchers);
  return matchers;
}

export function normalizeArabicScript(text: string): string {
  return text
    .replace(COMBINING_MARKS_AND_JOINERS, "")
    .replace(FOLDED_LETTERS, (letter) => LETTER_FOLDS[letter])
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - PERSIAN_DIGIT_OFFSET))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - ARABIC_INDIC_DIGIT_OFFSET));
}

const remap = (text: string, table: KeyboardLayout): string => [...text].map((character) => table[character] ?? character).join("");

function queryForms(needle: string, matchers: LayoutMatchers): string[] {
  const forms = [needle];
  if (matchers.latinKeys.test(needle)) forms.push(remap(needle, matchers.scriptByLatinKey));
  else if (matchers.scriptKeys.test(needle)) forms.push(remap(needle, matchers.latinByScriptKey));
  return forms.map((form) => normalizeArabicScript(form.toLowerCase()));
}

export function matchesArabicScriptQuery(needle: string, haystacks: readonly string[], layout: KeyboardLayout): boolean {
  const normalized = haystacks.map((text) => normalizeArabicScript(text.toLowerCase()));
  return queryForms(needle, matchersFor(layout)).some((form) => normalized.some((text) => text.includes(form)));
}
