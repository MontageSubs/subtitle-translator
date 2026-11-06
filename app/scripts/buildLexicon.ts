import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const OUTPUT_PATH = "public/lexicons/subtitle-lexicon.json";
const MANIFEST_PATH = "src/model-catalog/lexicon-subtitle.json";
const COMMON_WORDS_PER_LANGUAGE = 5000;
const WORD_PATTERN = /^[\p{L}\p{M}'’]+$/u;
const MIN_NAME_LENGTH = 3;

const LANGUAGES: Readonly<Record<string, string>> = {
  en: "english",
  de: "german",
  es: "spanish",
  fr: "french",
  it: "italian",
  nl: "dutch",
  pt: "portuguese",
  lv: "latvian",
  zh: "chinese",
  ja: "japanese",
  ar: "arabic",
};

const frequencyDirectory = join(dirname(require.resolve("most-common-words-by-language/package.json")), "build", "resources");
const frequentWords = (language: string, count: number): string[] => readFileSync(join(frequencyDirectory, `${language}.txt`), "utf8").split("\n").slice(0, count);
const stopwords = require("stopwords-iso") as Record<string, string[]>;
const maleNames = (require("@stdlib/datasets-male-first-names-en") as () => string[])();
const femaleNames = (require("@stdlib/datasets-female-first-names-en") as () => string[])();

const clean = (words: readonly string[]): string[] => words.map((word) => word.normalize("NFKC").toLowerCase().trim()).filter((word) => WORD_PATTERN.test(word));

const englishNames = new Set(clean([...maleNames, ...femaleNames]).filter((name) => name.length >= MIN_NAME_LENGTH));

const languages = Object.fromEntries(
  Object.entries(LANGUAGES).map(([code, name]) => {
    const names = code === "en" ? englishNames : new Set<string>();
    const stop = new Set(clean(stopwords[code] ?? []));
    const frequent = clean(frequentWords(name, COMMON_WORDS_PER_LANGUAGE)).filter((word) => !names.has(word));
    return [code, { common: [...new Set([...stop, ...frequent])].sort(), names: [...names].sort() }];
  }),
);

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
const lexiconBytes = Buffer.from(JSON.stringify({ version: 1, languages }));
writeFileSync(OUTPUT_PATH, lexiconBytes);

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
manifest.bytes = lexiconBytes.length;
manifest.files[0].sha256 = createHash("sha256").update(lexiconBytes).digest("hex");
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
