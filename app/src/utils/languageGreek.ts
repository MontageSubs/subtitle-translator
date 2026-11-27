const COMBINING_MARKS = /[\u0300-\u036f]/g;
const LATIN_KEYS = /^[a-z]+$/;
const GREEK_KEYS = /^[\u03b1-\u03c9]+$/;
const MIN_LAYOUT_QUERY_LENGTH = 3;

const GREEK_BY_LATIN_KEY: Readonly<Record<string, string>> = {
  w: "σ", e: "ε", r: "ρ", t: "τ", y: "υ", u: "θ", i: "ι", o: "ο", p: "π",
  a: "α", s: "σ", d: "δ", f: "φ", g: "γ", h: "η", j: "ξ", k: "κ", l: "λ",
  z: "ζ", x: "χ", c: "ψ", v: "ω", b: "β", n: "ν", m: "μ",
};

const LATIN_BY_GREEK_KEY: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.entries(GREEK_BY_LATIN_KEY).map(([latin, greek]) => [greek, latin])),
  σ: "s",
};

const LATIN_BY_GREEK_LETTER: Readonly<Record<string, string>> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "ks", ο: "o",
  π: "p", ρ: "r", σ: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};

const SPELLING_FOLDS: readonly (readonly [RegExp, string])[] = [
  [/mp/g, "b"], [/nt/g, "d"], [/gk|gg|ng|gh/g, "g"],
  [/ph/g, "f"], [/th/g, "t"], [/ch|kh|ks/g, "x"],
  [/ou|oy/g, "u"], [/ei|oi/g, "i"], [/ai/g, "e"],
  [/b/g, "v"], [/ey|eu|ev/g, "ef"], [/ay|au|av/g, "af"],
  [/[yhu]/g, "i"], [/w/g, "o"], [/[cq]/g, "k"],
  [/(.)\1+/g, "$1"],
];

const GREEK_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  af: ["νοτια αφρικη"],
  ar: ["αραβια", "αιγυπτος", "λιβανος", "μαγκρεμπ"],
  az: ["αζερι", "αζερμπαϊτζαν"],
  be: ["λευκορωσια", "μπελαρους"],
  bg: ["βουλγαρια"],
  bn: ["μπανγκλαντες", "βεγγαλη", "μπενγκαλι"],
  bs: ["βοσνια"],
  ca: ["καταλωνια", "καταλονια"],
  cs: ["τσεχια"],
  cy: ["ουαλια"],
  da: ["δανια", "δανεζικα"],
  de: ["γερμανια", "αυστρια", "ελβετια"],
  el: ["ελλαδα", "κυπρος", "νεοελληνικα", "νεα ελληνικα"],
  en: ["αγγλια", "αμερικη", "αμερικανικα", "βρετανικα", "ηπα", "μεγαλη βρετανια"],
  es: ["ισπανια", "καστιλιανικα", "λατινικη αμερικη", "μεξικο", "αργεντινη"],
  et: ["εσθονια"],
  fa: ["ιραν", "φαρσι"],
  fi: ["φινλανδια", "φινλανδεζικα"],
  fil: ["φιλιππινες", "ταγκαλογκ"],
  fr: ["γαλλια", "βελγιο"],
  ga: ["ιρλανδια"],
  gd: ["σκωτια"],
  he: ["ισραηλ", "εβραικα"],
  hi: ["ινδια", "ινδικα"],
  hr: ["κροατια"],
  hu: ["ουγγαρια", "ουγγαρεζικα"],
  hy: ["αρμενια"],
  id: ["ινδονησια"],
  is: ["ισλανδια"],
  it: ["ιταλια"],
  ja: ["ιαπωνια", "ιαπωνεζικα"],
  ka: ["γεωργια"],
  kk: ["καζακσταν"],
  ko: ["κορεα", "νοτια κορεα"],
  lt: ["λιθουανια"],
  lv: ["λετονια"],
  lzh: ["κλασικα κινεζικα"],
  mk: ["βορεια μακεδονια"],
  ms: ["μαλαισια"],
  mt: ["μαλτα"],
  ne: ["νεπαλ"],
  nl: ["ολλανδια", "ολλανδεζικα", "φλαμανδικα", "βελγιο"],
  no: ["νορβηγια", "νορβηγεζικα"],
  pl: ["πολωνια", "πολωνεζικα"],
  pt: ["πορτογαλια", "βραζιλια"],
  ro: ["ρουμανια", "μολδαβια"],
  ru: ["ρωσια", "ρωσσικα"],
  sk: ["σλοβακια"],
  sl: ["σλοβενια"],
  sq: ["αλβανια"],
  sr: ["σερβια"],
  sv: ["σουηδια", "σουηδεζικα"],
  sw: ["κενυα", "τανζανια", "σουαχελι"],
  th: ["ταϊλανδη", "ταϊλανδεζικα", "σιαμ"],
  tr: ["τουρκια"],
  uk: ["ουκρανια"],
  ur: ["πακιστανικα"],
  vi: ["βιετναμ", "βιετναμεζικα"],
  yue: ["καντονεζικα", "χονγκ κονγκ"],
  zh: ["κινα", "μανδαρινικα", "πουτονγκχουα"],
  "zh-Hans": ["απλοποιημενα"],
  "zh-Hant": ["παραδοσιακα", "ταιβαν", "χονγκ κονγκ"],
};

const remap = (text: string, table: Readonly<Record<string, string>>): string => [...text].map((character) => table[character] ?? character).join("");

const normalizeGreek = (text: string): string => text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().replace(/ς/g, "σ");

const foldSpelling = (latin: string): string => SPELLING_FOLDS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), latin);

const skeletonOf = (normalized: string): string => foldSpelling(remap(normalized, LATIN_BY_GREEK_LETTER));

const skeleton = (text: string): string => skeletonOf(normalizeGreek(text));

function layoutSwapped(normalized: string): string | undefined {
  if (normalized.length < MIN_LAYOUT_QUERY_LENGTH) return undefined;
  if (LATIN_KEYS.test(normalized)) return remap(normalized, GREEK_BY_LATIN_KEY);
  return GREEK_KEYS.test(normalized) ? remap(normalized, LATIN_BY_GREEK_KEY) : undefined;
}

export function greekQueryForms(needle: string): string[] {
  const normalized = normalizeGreek(needle);
  const swapped = layoutSwapped(normalized);
  return (swapped ? [normalized, swapped] : [normalized]).map(skeletonOf);
}

export function greekLanguageAliases(code: string): readonly string[] {
  return GREEK_LANGUAGE_ALIASES[code] ?? GREEK_LANGUAGE_ALIASES[code.split("-")[0]] ?? [];
}

export function matchesGreekQuery(needle: string, haystacks: readonly string[]): boolean {
  const skeletons = haystacks.map(skeleton);
  return greekQueryForms(needle).some((form) => skeletons.some((text) => text.includes(form)));
}
