const COMBINING_MARKS_AND_JOINERS = /[\u064B-\u065F\u0670\u0640\u200C\u200D]/g;
const PERSIAN_DIGIT_OFFSET = 0x06f0;
const ARABIC_INDIC_DIGIT_OFFSET = 0x0660;
const LETTER_FOLDS: Readonly<Record<string, string>> = { ي: "ی", ى: "ی", ك: "ک", ة: "ه", أ: "ا", إ: "ا", ٱ: "ا", آ: "ا", ۀ: "ه" };
const FOLDED_LETTERS = new RegExp(`[${Object.keys(LETTER_FOLDS).join("")}]`, "g");
const LATIN_KEYS = /^[a-z;,./'[\]\\]+$/;
const PERSIAN_KEYS = /^[\u0621-\u06d3\u200c\s.,/;'[\]\\]+$/;

const PERSIAN_BY_LATIN_KEY: Readonly<Record<string, string>> = {
  q: "ض", w: "ص", e: "ث", r: "ق", t: "ف", y: "غ", u: "ع", i: "ه", o: "خ", p: "ح", "[": "ج", "]": "چ", "\\": "پ",
  a: "ش", s: "س", d: "ی", f: "ب", g: "ل", h: "ا", j: "ت", k: "ن", l: "م", ";": "ک", "'": "گ",
  z: "ظ", x: "ط", c: "ز", v: "ر", b: "ذ", n: "د", m: "ئ", ",": "و", ".": ".", "/": "/",
};

const LATIN_BY_PERSIAN_KEY: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(PERSIAN_BY_LATIN_KEY).map(([latin, persian]) => [persian, latin]));

const PERSIAN_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ar: ["عرب", "عربستان", "arabi"],
  az: ["آذری", "آذربایجان", "ترکی", "azeri", "azari"],
  ckb: ["سورانی", "کرد", "کردستان", "sorani", "kurdi"],
  de: ["آلمان", "المانی", "jarman", "almani", "alemani"],
  el: ["یونان", "یونانی", "yunani"],
  en: ["انگلیس", "آمریکا", "engelisi", "ingilisi", "inglisi"],
  es: ["اسپانیا", "اسپانیولی", "espania", "espanyai"],
  fa: ["پارسی", "ایران", "farsi", "parsi"],
  fr: ["فرانسه", "فرانسوی", "faranse"],
  he: ["اسرائیل", "ebri"],
  hi: ["هند", "هندی", "hendi"],
  hy: ["ارمنستان", "ارمنی", "armani"],
  id: ["اندونزی", "andonezi"],
  it: ["ایتالیا", "ایتالیایی", "italia"],
  ja: ["ژاپن", "ژاپنی", "japoni"],
  ka: ["گرجستان", "گرجی", "gorji"],
  ko: ["کره", "کره‌ای", "kore", "korei"],
  ku: ["کرد", "کردستان", "کرمانج", "kurdi"],
  nl: ["هلند", "هلندی", "holandi"],
  pl: ["لهستان", "لهستانی", "lahestan"],
  prs: ["افغانستان", "افغانی", "dari", "afghan"],
  ps: ["افغانستان", "افغانی", "pashto", "afghani"],
  pt: ["پرتغال", "پرتقال", "پرتغالی", "portoghali"],
  ru: ["روس", "روسیه", "روسی", "rusi"],
  sv: ["سوئد", "سوئدی", "sued"],
  tg: ["تاجیکستان", "تاجیکی", "tajik"],
  th: ["تایلند", "تایلندی", "tai"],
  tk: ["ترکمنستان", "ترکمن", "torkaman"],
  tr: ["ترکیه", "استانبول", "استانبولی", "torki", "turki"],
  uk: ["اوکراین", "اوکراینی", "ukrain"],
  ur: ["پاکستان", "اردو", "pakestan"],
  uz: ["ازبکستان", "ازبکی", "ozbak"],
  vi: ["ویتنام", "ویتنامی", "vietnami"],
  zh: ["چین", "چینی", "chini"],
};

export function normalizePersian(text: string): string {
  return text
    .replace(COMBINING_MARKS_AND_JOINERS, "")
    .replace(FOLDED_LETTERS, (letter) => LETTER_FOLDS[letter])
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - PERSIAN_DIGIT_OFFSET))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - ARABIC_INDIC_DIGIT_OFFSET));
}

const remap = (text: string, table: Readonly<Record<string, string>>): string => [...text].map((character) => table[character] ?? character).join("");

export function persianQueryForms(needle: string): string[] {
  const forms = [needle];
  if (LATIN_KEYS.test(needle)) forms.push(remap(needle, PERSIAN_BY_LATIN_KEY));
  else if (PERSIAN_KEYS.test(needle)) forms.push(remap(needle, LATIN_BY_PERSIAN_KEY));
  return forms.map((form) => normalizePersian(form.toLowerCase()));
}

export function persianLanguageAliases(code: string): readonly string[] {
  return PERSIAN_LANGUAGE_ALIASES[code] ?? PERSIAN_LANGUAGE_ALIASES[code.split("-")[0]] ?? [];
}

export function matchesPersianQuery(needle: string, haystacks: readonly string[]): boolean {
  const normalized = haystacks.map((text) => normalizePersian(text.toLowerCase()));
  return persianQueryForms(needle).some((form) => normalized.some((text) => text.includes(form)));
}
