import { KeyboardLayout, matchesArabicScriptQuery } from "./arabicScript";

const ARABIC_KEY_LAYOUT: KeyboardLayout = {
  q: "ض", w: "ص", e: "ث", r: "ق", t: "ف", y: "غ", u: "ع", i: "ه", o: "خ", p: "ح", "[": "ج", "]": "د",
  a: "ش", s: "س", d: "ي", f: "ب", g: "ل", h: "ا", j: "ت", k: "ن", l: "م", ";": "ك", "'": "ط",
  z: "ئ", x: "ء", c: "ؤ", v: "ر", b: "لا", n: "ى", m: "ة", ",": "و", ".": "ز", "/": "ظ", "`": "ذ",
};

const ARABIC_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ar: ["عربي", "العربية", "فصحى", "3arabi", "3arabia", "arabi"],
  am: ["اثيوبيا", "امهري", "امهرية", "amhari", "ethiopia"],
  ckb: ["سوراني", "كردي", "كردستان", "sorani", "kurdi"],
  de: ["المانيا", "الماني", "almani", "almanya", "alman"],
  el: ["اليونان", "يوناني", "اغريقي", "yunani", "yonani"],
  en: ["انجليزي", "انكليزي", "بريطانيا", "امريكا", "inglizi", "ingleezi", "inglish", "amreeki"],
  es: ["اسبانيا", "اسباني", "اسبانى", "asbani", "espanyoli", "sbanyoli"],
  fa: ["ايران", "فارسي", "farsi", "irani"],
  fr: ["فرنسا", "فرنسي", "فرنساوي", "faransi", "fransa", "faransa"],
  ha: ["نيجيريا", "هوسا", "hausa", "hawsa"],
  he: ["اسرائيل", "عبري", "ibri", "3ibri"],
  hi: ["الهند", "هندي", "hindi", "hendi"],
  id: ["اندونيسيا", "اندونيسي", "indonesi"],
  it: ["ايطاليا", "ايطالي", "itali", "talyani"],
  ja: ["اليابان", "ياباني", "yabani"],
  kab: ["الجزائر", "قبائلي", "قبائلية", "امازيغي", "qabaili", "amazigh", "jazaer"],
  ko: ["كوريا", "كوري", "kori"],
  ku: ["كردستان", "كردي", "كوردي", "kurdi", "kordi"],
  mt: ["مالطا", "مالطي"],
  nl: ["هولندا", "هولندي", "holandi", "hulandi"],
  pl: ["بولندا", "بولندي", "bolandi"],
  pt: ["البرتغال", "برتغالي", "البرازيل", "burtughali", "portughali"],
  ru: ["روسيا", "روسي", "rusi", "roosi"],
  so: ["الصومال", "صومالي", "somali"],
  sv: ["السويد", "سويدي", "swidi"],
  sw: ["كينيا", "تنزانيا", "سواحيلي", "swahili", "sawahili"],
  ti: ["اريتريا", "تجرينية", "تيغرينية"],
  tr: ["تركيا", "تركي", "turki", "torki"],
  tzm: ["امازيغي", "امازيغية", "بربري", "amazigh", "berber", "barbari"],
  uk: ["اوكرانيا", "اوكراني", "okrani"],
  ur: ["باكستان", "اردو", "urdu"],
  vi: ["فيتنام", "فيتنامي"],
  zgh: ["المغرب", "امازيغي", "امازيغية", "بربري", "شلحة", "amazigh", "berber", "barbari", "maghrib"],
  zh: ["الصين", "صيني", "مندرين", "sini", "chini"],
};

export function arabicLanguageAliases(code: string): readonly string[] {
  return ARABIC_LANGUAGE_ALIASES[code] ?? ARABIC_LANGUAGE_ALIASES[code.split("-")[0]] ?? [];
}

export const matchesArabicQuery = (needle: string, haystacks: readonly string[]): boolean => matchesArabicScriptQuery(needle, haystacks, ARABIC_KEY_LAYOUT);
