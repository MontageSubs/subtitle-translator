const COMBINING_MARKS = /[̀-ͯ]/g;
const APOSTROPHES = /[ʻʼ‘’'`´ʹ]/g;
const CYRILLIC = /[Ѐ-ӿ]/;
const NAME_SUFFIX = /(?:\s*tili|cha)$/;
const MIN_STEM_LENGTH = 3;

const LATIN_BY_CYRILLIC_LETTER: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "",
  э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

const UZBEK_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ar: ["arabiston"],
  az: ["azeri", "ozarbayjon"],
  bn: ["bangladesh", "bengaliya"],
  cs: ["chexiya"],
  de: ["germaniya"],
  el: ["gretsiya", "grek"],
  en: ["angliya", "amerika", "britaniya"],
  es: ["ispaniya"],
  fa: ["eron", "forscha"],
  fil: ["filipino", "tagalog"],
  fr: ["fransiya"],
  he: ["isroil", "ibroniy"],
  hi: ["hindiston"],
  hu: ["vengriya"],
  id: ["indoneziya"],
  it: ["italiya"],
  ja: ["yaponiya"],
  kk: ["qozogiston"],
  ko: ["koreya", "janubiy koreya"],
  ky: ["qirgiziston"],
  ms: ["malayziya"],
  ne: ["nepal"],
  nl: ["gollandiya", "golland", "niderlandiya"],
  pl: ["polsha"],
  prs: ["afgon"],
  ps: ["afgon"],
  pt: ["portugaliya", "braziliya"],
  ro: ["ruminiya", "moldovan"],
  ru: ["rossiya"],
  sv: ["shvetsiya"],
  tg: ["tojikiston"],
  th: ["tailand"],
  tk: ["turkmaniston"],
  tr: ["turkiya"],
  uk: ["ukraina"],
  ur: ["pokiston"],
  vi: ["vetnam"],
  zh: ["xitoy", "mandarin", "putunxua"],
};

const remapCyrillic = (text: string): string => [...text].map((character) => LATIN_BY_CYRILLIC_LETTER[character] ?? character).join("");

function uzbekSkeleton(text: string): string {
  const lowered = text.toLowerCase().replace(/ş/g, "sh").replace(/ç/g, "ch");
  const latin = CYRILLIC.test(lowered) ? remapCyrillic(lowered) : lowered;
  return latin.normalize("NFD").replace(COMBINING_MARKS, "").replace(APOSTROPHES, "").replace(/x/g, "h").replace(/w/g, "v");
}

function queryForms(needle: string): string[] {
  const skeleton = uzbekSkeleton(needle);
  const stem = skeleton.replace(NAME_SUFFIX, "");
  return stem.length >= MIN_STEM_LENGTH && stem !== skeleton ? [skeleton, stem] : [skeleton];
}

export function uzbekLanguageAliases(code: string): readonly string[] {
  return UZBEK_LANGUAGE_ALIASES[code] ?? UZBEK_LANGUAGE_ALIASES[code.split("-")[0]] ?? [];
}

export function matchesUzbekQuery(needle: string, haystacks: readonly string[]): boolean {
  const skeletons = haystacks.map(uzbekSkeleton);
  return queryForms(needle).some((form) => skeletons.some((text) => text.includes(form)));
}
