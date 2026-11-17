const NIQQUD_AND_CANTILLATION = /[\u0591-\u05C7]/g;
const FINAL_LETTER_FOLDS: Readonly<Record<string, string>> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };
const FINAL_LETTERS = /[ךםןףץ]/g;
const LATIN_KEYS = /^[a-z;,./']+$/;
const HEBREW_KEYS = /^[\u05D0-\u05EA\u05BE\s'/,.;]+$/;

const HEBREW_BY_LATIN_KEY: Readonly<Record<string, string>> = {
  q: "/", w: "'", e: "ק", r: "ר", t: "א", y: "ט", u: "ו", i: "ן", o: "ם", p: "פ",
  a: "ש", s: "ד", d: "ג", f: "כ", g: "ע", h: "י", j: "ח", k: "ל", l: "ך", ";": "ף", "'": ",",
  z: "ז", x: "ס", c: "ב", v: "ה", b: "נ", n: "מ", m: "צ", ",": "ת", ".": "ץ", "/": ".",
};

const LATIN_BY_HEBREW_KEY: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(HEBREW_BY_LATIN_KEY).map(([latin, hebrew]) => [hebrew, latin]));

export function normalizeHebrew(text: string): string {
  return text.replace(NIQQUD_AND_CANTILLATION, "").replace(FINAL_LETTERS, (letter) => FINAL_LETTER_FOLDS[letter]);
}

const remap = (text: string, table: Readonly<Record<string, string>>): string => [...text].map((character) => table[character] ?? character).join("");

export function hebrewQueryForms(needle: string): string[] {
  const forms = [needle];
  if (LATIN_KEYS.test(needle)) forms.push(remap(needle, HEBREW_BY_LATIN_KEY));
  else if (HEBREW_KEYS.test(needle)) forms.push(remap(needle, LATIN_BY_HEBREW_KEY));
  return forms.map((form) => normalizeHebrew(form));
}

export function matchesHebrewQuery(needle: string, haystacks: readonly string[]): boolean {
  const normalized = haystacks.map((text) => normalizeHebrew(text.toLowerCase()));
  return hebrewQueryForms(needle).some((form) => normalized.some((text) => text.includes(form)));
}
