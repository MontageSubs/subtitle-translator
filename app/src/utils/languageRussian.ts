const COMBINING_MARKS = /[̀-ͯ]/g;
const LATIN_KEYS = /^[a-z;,.'[\]`]+$/;
const CYRILLIC_KEYS = /^[а-яё]+$/;
const TRANSLITERATABLE = /^[a-z\s'-]+$/;
const MIN_LAYOUT_QUERY_LENGTH = 3;

const CYRILLIC_BY_LATIN_KEY: Readonly<Record<string, string>> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з", "[": "х", "]": "ъ",
  a: "ф", s: "ы", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л", l: "д", ";": "ж", "'": "э",
  z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь", ",": "б", ".": "ю", "`": "ё",
};

const LATIN_BY_CYRILLIC_KEY: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(CYRILLIC_BY_LATIN_KEY).map(([latin, cyrillic]) => [cyrillic, latin]));

const LATIN_BY_CYRILLIC_LETTER: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", ґ: "g", д: "d", е: "e", є: "e", ж: "zh", з: "z", и: "i", і: "i", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ў: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sh", ы: "i", э: "e", ю: "iu", я: "ia",
};

const RUSSIAN_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  af: ["бурский"],
  az: ["азери"],
  bn: ["бенгали"],
  ca: ["валенсийский"],
  en: ["англ"],
  fa: ["фарси"],
  fil: ["тагальский"],
  ky: ["кыргызский"],
  la: ["латынь"],
  my: ["мьянманский"],
  nl: ["голландский", "фламандский"],
  pa: ["пенджаби"],
  prs: ["афганский"],
  ps: ["афганский"],
  rom: ["цыганский"],
  ro: ["молдавский"],
  zh: ["мандарин", "мандаринский", "путунхуа"],
};

const remap = (text: string, table: Readonly<Record<string, string>>): string => [...text].map((character) => table[character] ?? character).join("");

const normalizeCyrillic = (text: string): string => text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();

const foldTransliteration = (latin: string): string =>
  latin
    .replace(/shch|sch/g, "sh")
    .replace(/kh/g, "h")
    .replace(/ts/g, "c")
    .replace(/(^|[^a-z])y([eo])/g, "$1e")
    .replace(/[yj]/g, "i")
    .replace(/w/g, "v")
    .replace(/(.)\1+/g, "$1");

const transliterationSkeleton = (text: string): string => foldTransliteration(remap(normalizeCyrillic(text), LATIN_BY_CYRILLIC_LETTER).replace(/[ъь]/g, ""));

export function russianQueryForms(needle: string): string[] {
  const forms = [needle];
  if (needle.length >= MIN_LAYOUT_QUERY_LENGTH) {
    if (LATIN_KEYS.test(needle)) forms.push(remap(needle, CYRILLIC_BY_LATIN_KEY));
    else if (CYRILLIC_KEYS.test(needle)) forms.push(remap(needle, LATIN_BY_CYRILLIC_KEY));
  }
  return forms.map(normalizeCyrillic);
}

export function russianLanguageAliases(code: string): readonly string[] {
  return RUSSIAN_LANGUAGE_ALIASES[code] ?? RUSSIAN_LANGUAGE_ALIASES[code.split("-")[0]] ?? [];
}

export function matchesRussianQuery(needle: string, haystacks: readonly string[]): boolean {
  const normalized = haystacks.map(normalizeCyrillic);
  if (russianQueryForms(needle).some((form) => normalized.some((text) => text.includes(form)))) return true;
  if (!TRANSLITERATABLE.test(needle)) return false;
  const skeleton = foldTransliteration(needle);
  return haystacks.some((text) => transliterationSkeleton(text).includes(skeleton));
}
