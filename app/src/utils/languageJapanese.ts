import { languageName } from "./languageNames";
import { foldKana, japaneseReading } from "./languageReading";

const HIRAGANA_SYLLABLES =
  "あa いi うu えe おo かka きki くku けke こko さsa しshi すsu せse そso たta ちchi つtsu てte とto なna にni ぬnu ねne のno はha ひhi ふfu へhe ほho まma みmi むmu めme もmo やya ゆyu よyo らra りri るru れre ろro わwa をwo んn がga ぎgi ぐgu げge ごgo ざza じji ずzu ぜze ぞzo だda ぢji づzu でde どdo ばba びbi ぶbu べbe ぼbo ぱpa ぴpi ぷpu ぺpe ぽpo ゔvu ぁa ぃi ぅu ぇe ぉo";

const ROMAJI_BY_KANA = new Map<string, string>([...HIRAGANA_SYLLABLES.matchAll(/([ぁ-ゔ])([a-z]+)/g)].map((match) => [match[1], match[2]]));
const SMALL_YA_ROW: Readonly<Record<string, string>> = { ゃ: "a", ゅ: "u", ょ: "o" };
const SMALL_VOWELS: Readonly<Record<string, string>> = { ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o" };
const AFFRICATE_ENDINGS = /(shi|chi|ji)$/;
const LONG_VOWELS = /([aiueo])\1|ou/g;
const KANA_LETTER = /[ぁ-ゖァ-ヺヽ-ヿｦ-ﾟ]/;
const IGNORED_IN_KANA_COMPARISON = /[\sー・･·()（）\-‐~〜]/g;
const ASCII_QUERY = /^[a-z\s'-]+$/;

const KUNREI_SPELLINGS: Readonly<Record<string, string>> = {
  shi: "si", sha: "sya", shu: "syu", sho: "syo", she: "se",
  chi: "ti", cha: "tya", chu: "tyu", cho: "tyo", che: "te",
  ji: "zi", ja: "zya", ju: "zyu", jo: "zyo", je: "ze",
  tsu: "tu", fu: "hu",
};
const KUNREI_PATTERN = new RegExp(Object.keys(KUNREI_SPELLINGS).join("|"), "g");

const JAPANESE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  be: ["白ロシア語"],
  bn: ["ベンガリ語", "ベンガリー語"],
  ca: ["カタルーニャ語", "カタラン語"],
  ceb: ["ビサヤ語"],
  cy: ["ウェルシュ"],
  en: ["イングリッシュ", "米語", "英国語"],
  fa: ["ペルシャ語", "ファルシ"],
  fil: ["タガログ語", "タガログ"],
  hi: ["ヒンディ語"],
  hmn: ["モン語"],
  ja: ["にっぽんご", "ジャパニーズ"],
  ka: ["グルジア語"],
  ko: ["ハングル", "朝鮮語", "hangul", "hangeul"],
  ku: ["クルディッシュ"],
  ky: ["キルギズ語"],
  mk: ["北マケドニア語"],
  ms: ["マレーシア語"],
  my: ["ビルマ語"],
  nl: ["ダッチ"],
  ps: ["パシュトー語", "パシュトゥン語"],
  ur: ["ウルドゥ語"],
  uz: ["ウズベキスタン語"],
  yue: ["広東", "カントニーズ", "香港"],
  zh: ["中文", "漢語", "北京語", "マンダリン"],
  "zh-Hans": ["簡体", "簡体字", "中国本土"],
  "zh-Hant": ["繁体", "繁体字", "台湾", "香港"],
};

export function containsKana(text: string): boolean {
  return KANA_LETTER.test(text);
}

function toRomaji(hiragana: string): string {
  let romaji = "";
  let previous = "";
  let doubleNext = false;
  const replacePrevious = (replacement: string): void => {
    romaji = romaji.slice(0, romaji.length - previous.length) + replacement;
    previous = replacement;
  };
  for (const kana of hiragana) {
    if (kana === "っ") {
      doubleNext = true;
      continue;
    }
    if (kana === "ー") {
      previous = romaji.slice(-1);
      romaji += previous;
      continue;
    }
    const smallRow = SMALL_YA_ROW[kana];
    if (smallRow !== undefined && previous) {
      replacePrevious(AFFRICATE_ENDINGS.test(previous) ? previous.slice(0, -1) + smallRow : `${previous.slice(0, -1)}y${smallRow}`);
      continue;
    }
    const smallVowel = SMALL_VOWELS[kana];
    if (smallVowel !== undefined && previous) {
      replacePrevious(previous === "u" ? `w${smallVowel}` : previous.slice(0, -1) + smallVowel);
      continue;
    }
    const syllable = ROMAJI_BY_KANA.get(kana);
    if (syllable === undefined) continue;
    if (doubleNext) romaji += syllable[0];
    doubleNext = false;
    romaji += syllable;
    previous = syllable;
  }
  return romaji;
}

function canonicalRomaji(romaji: string): string {
  return romaji
    .replace(/[^a-z]/g, "")
    .replace(/jy/g, "j")
    .replace(KUNREI_PATTERN, (spelling) => KUNREI_SPELLINGS[spelling])
    .replace(LONG_VOWELS, (match) => match[0]);
}

function squashKana(text: string): string {
  return foldKana(text).replace(IGNORED_IN_KANA_COMPARISON, "");
}

export function matchesJapaneseQuery(code: string, query: string, interfaceIsJapanese: boolean): boolean {
  const kanaQuery = squashKana(query);
  if (!kanaQuery) return false;
  const baseCode = code.split("-")[0];
  const aliases = [...(JAPANESE_ALIASES[code] ?? []), ...(code === baseCode ? [] : JAPANESE_ALIASES[baseCode] ?? [])];
  const readings = [japaneseReading(languageName(code, "ja")), ...aliases.map(japaneseReading)];

  if (containsKana(query)) return readings.some((reading) => squashKana(reading).includes(kanaQuery));
  if (!interfaceIsJapanese) return false;
  if (aliases.some((alias) => alias.includes(query.trim()))) return true;
  if (!ASCII_QUERY.test(query.trim().toLowerCase())) return false;

  const romajiQuery = query.trim().toLowerCase().replace(/[\s'-]/g, "");
  const canonicalQuery = canonicalRomaji(romajiQuery);
  return readings.some((reading) => {
    const romaji = toRomaji(foldKana(reading).replace(IGNORED_IN_KANA_COMPARISON, (mark) => (mark === "ー" ? mark : "")));
    return romaji.includes(romajiQuery) || canonicalRomaji(romaji).includes(canonicalQuery);
  });
}
