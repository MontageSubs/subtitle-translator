const COMBINING_MARKS = /[̀-ͯ]/g;
const APOSTROPHES = /['’ʼ]/g;
const LATIN_KEYS = /^[a-z;,.'[\]`]+$/;
const CYRILLIC_KEYS = /^[а-яіїєґ]+$/;
const TRANSLITERATABLE = /^[a-z\s'’-]+$/;
const MIN_LAYOUT_QUERY_LENGTH = 3;

const CYRILLIC_BY_LATIN_KEY: Readonly<Record<string, string>> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з", "[": "х", "]": "ї",
  a: "ф", s: "і", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л", l: "д", ";": "ж", "'": "є",
  z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь", ",": "б", ".": "ю", "`": "ґ",
};

const LATIN_BY_CYRILLIC_KEY: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(CYRILLIC_BY_LATIN_KEY).map(([latin, cyrillic]) => [cyrillic, latin]));

const LATIN_BY_CYRILLIC_LETTER: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ю: "iu", я: "ia",
};

const UKRAINIAN_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  af: ["бурська"],
  az: ["азері"],
  bn: ["бенгалі"],
  ca: ["валенсійська"],
  ceb: ["себуано"],
  en: ["англ"],
  fa: ["фарсі"],
  fil: ["тагальська"],
  he: ["єврейська"],
  la: ["латина"],
  nl: ["голландська", "фламандська"],
  prs: ["афганська"],
  ps: ["афганська"],
  ro: ["молдовська"],
  zh: ["мандаринська", "путунхуа"],
};

const remap = (text: string, table: Readonly<Record<string, string>>): string => [...text].map((character) => table[character] ?? character).join("");

const normalizeCyrillic = (text: string): string => text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().replace(/ґ/g, "г").replace(APOSTROPHES, "");

const foldTransliteration = (latin: string): string =>
  latin
    .replace(/shch|sch/g, "sh")
    .replace(/kh/g, "h")
    .replace(/ts/g, "c")
    .replace(/[yj]/g, "i")
    .replace(/[gw]/g, (letter) => (letter === "g" ? "h" : "v"))
    .replace(/(.)\1+/g, "$1");

const transliterationSkeleton = (text: string): string => foldTransliteration(remap(normalizeCyrillic(text), LATIN_BY_CYRILLIC_LETTER).replace(/ь/g, ""));

export function ukrainianQueryForms(needle: string): string[] {
  const forms = [needle];
  if (needle.length >= MIN_LAYOUT_QUERY_LENGTH) {
    if (LATIN_KEYS.test(needle)) forms.push(remap(needle, CYRILLIC_BY_LATIN_KEY));
    else if (CYRILLIC_KEYS.test(needle)) forms.push(remap(needle, LATIN_BY_CYRILLIC_KEY));
  }
  return forms.map(normalizeCyrillic);
}

export function ukrainianLanguageAliases(code: string): readonly string[] {
  return UKRAINIAN_LANGUAGE_ALIASES[code] ?? UKRAINIAN_LANGUAGE_ALIASES[code.split("-")[0]] ?? [];
}

export function matchesUkrainianQuery(needle: string, haystacks: readonly string[]): boolean {
  const normalized = haystacks.map(normalizeCyrillic);
  if (ukrainianQueryForms(needle).some((form) => normalized.some((text) => text.includes(form)))) return true;
  if (!TRANSLITERATABLE.test(needle)) return false;
  const skeleton = foldTransliteration(needle.replace(APOSTROPHES, ""));
  return haystacks.some((text) => transliterationSkeleton(text).includes(skeleton));
}
