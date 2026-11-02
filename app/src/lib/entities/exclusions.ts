import { baseLanguage } from "../subtitle/common/languageCodes";
import { WELL_KNOWN_PLACES } from "./places";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const MACRO_REGIONS = ["001", "002", "003", "005", "009", "011", "013", "014", "015", "017", "018", "019", "021", "029", "030", "034", "035", "053", "054", "057", "061", "142", "143", "145", "150", "151", "154", "155"];
const WHITESPACE_PATTERN = /\s+/g;
const LEADING_ARTICLES: Readonly<Record<string, readonly string[]>> = { en: ["the "], es: ["el ", "la ", "los ", "las "], fr: ["le ", "la ", "les "], de: ["der ", "die ", "das "], pt: ["o ", "a ", "os ", "as "], it: ["il ", "lo ", "la "] };

const POLYSEMOUS_WORDS: Readonly<Record<string, readonly string[]>> = {
  en: ["god", "gods", "lord", "sir", "madam", "ma'am", "miss", "mister", "mom", "mommy", "dad", "daddy", "mother", "father", "doctor", "captain", "general", "major", "colonel", "sergeant", "officer", "president", "king", "queen", "prince", "princess", "professor", "judge", "detective", "agent", "saint", "heaven", "hell", "devil", "satan", "angel", "um", "uh", "er", "hmm", "huh", "ah", "oh", "ooh", "wow", "hey", "hello", "hi", "yeah", "okay", "ok", "please", "thanks", "sorry", "goodbye", "bye", "mr", "mrs", "ms", "dr", "holy", "damn"],
  es: ["dios", "señor", "señora", "señorita", "mamá", "papá", "doctor", "capitán", "general", "presidente", "rey", "reina", "príncipe", "princesa", "cielo", "infierno", "diablo"],
  fr: ["dieu", "seigneur", "monsieur", "madame", "mademoiselle", "maman", "papa", "docteur", "capitaine", "général", "président", "roi", "reine", "prince", "princesse", "ciel", "enfer", "diable"],
  de: ["gott", "herr", "frau", "fräulein", "mama", "papa", "doktor", "hauptmann", "general", "präsident", "könig", "königin", "prinz", "prinzessin", "himmel", "hölle", "teufel"],
  it: ["dio", "signore", "signora", "signorina", "mamma", "papà", "dottore", "capitano", "generale", "presidente", "re", "regina", "principe", "principessa", "cielo", "inferno", "diavolo"],
  pt: ["deus", "senhor", "senhora", "mamãe", "papai", "doutor", "capitão", "general", "presidente", "rei", "rainha", "príncipe", "princesa", "céu", "inferno", "diabo"],
  ja: ["神", "神様", "悪魔", "天国", "地獄", "先生", "博士", "大統領", "王", "女王", "王子", "姫", "隊長", "将軍"],
  zh: ["上帝", "神", "魔鬼", "天堂", "地狱", "老师", "博士", "总统", "国王", "女王", "王子", "公主", "队长", "将军"],
};

export interface NameExclusions {
  isExcluded(normalizedKey: string): boolean;
  mayStartWith(tokenKey: string): boolean;
}

const foldKey = (text: string): string => text.normalize("NFKC").replace(WHITESPACE_PATTERN, " ").trim().toLowerCase();

function displayNames(locale: string, type: "region" | "language"): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([locale], { type, fallback: "code" });
  } catch {
    return null;
  }
}

function addCodes(target: Set<string>, names: Intl.DisplayNames | null, codes: Iterable<string>): void {
  if (!names) return;
  for (const code of codes) {
    const label = names.of(code);
    if (label && foldKey(label) !== foldKey(code)) target.add(foldKey(label));
  }
}

function* twoLetterCodes(upper: boolean): Generator<string> {
  for (const first of LETTERS) for (const second of LETTERS) yield upper ? `${first}${second}`.toUpperCase() : `${first}${second}`;
}

export function createNameExclusions(sourceLang: string): NameExclusions {
  const base = baseLanguage(sourceLang);
  const locales = [...new Set([base, "en"])];
  const stable = new Set<string>(WELL_KNOWN_PLACES);
  for (const locale of locales) {
    addCodes(stable, displayNames(locale, "region"), [...twoLetterCodes(true), ...MACRO_REGIONS]);
    addCodes(stable, displayNames(locale, "language"), twoLetterCodes(false));
    for (const word of POLYSEMOUS_WORDS[locale] ?? []) stable.add(foldKey(word));
  }
  const articles = LEADING_ARTICLES[base] ?? [];
  const heads = new Set<string>();
  for (const key of stable) {
    heads.add(key.split(" ")[0]);
    heads.add(String.fromCodePoint(key.codePointAt(0)!));
  }
  return {
    mayStartWith: (tokenKey) => heads.has(tokenKey),
    isExcluded(key) {
      if (stable.has(key)) return true;
      const article = articles.find((prefix) => key.startsWith(prefix));
      return article !== undefined && stable.has(key.slice(article.length));
    },
  };
}
