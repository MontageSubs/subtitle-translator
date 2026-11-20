import { KeyboardLayout, matchesArabicScriptQuery } from "./arabicScript";

const PERSIAN_KEY_LAYOUT: KeyboardLayout = {
  q: "ض", w: "ص", e: "ث", r: "ق", t: "ف", y: "غ", u: "ع", i: "ه", o: "خ", p: "ح", "[": "ج", "]": "چ", "\\": "پ",
  a: "ش", s: "س", d: "ی", f: "ب", g: "ل", h: "ا", j: "ت", k: "ن", l: "م", ";": "ک", "'": "گ",
  z: "ظ", x: "ط", c: "ز", v: "ر", b: "ذ", n: "د", m: "ئ", ",": "و", ".": ".", "/": "/",
};

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

export function persianLanguageAliases(code: string): readonly string[] {
  return PERSIAN_LANGUAGE_ALIASES[code] ?? PERSIAN_LANGUAGE_ALIASES[code.split("-")[0]] ?? [];
}

export const matchesPersianQuery = (needle: string, haystacks: readonly string[]): boolean => matchesArabicScriptQuery(needle, haystacks, PERSIAN_KEY_LAYOUT);
