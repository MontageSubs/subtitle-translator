const KANJI_READINGS: ReadonlyArray<readonly [string, string]> = [
  ["簡体", "かんたい"],
  ["繁体", "はんたい"],
  ["文字", "もじ"],
  ["中国", "ちゅうごく"],
  ["中央", "ちゅうおう"],
  ["日本", "にほん"],
  ["韓国", "かんこく"],
  ["広東", "かんとん"],
  ["漢文", "かんぶん"],
  ["低地", "ていち"],
  ["高地", "こうち"],
  ["南部", "なんぶ"],
  ["北部", "ほくぶ"],
  ["英", "えい"],
  ["西", "にし"],
  ["南", "みなみ"],
  ["語", "ご"],
  ["字", "じ"],
];

const HAN_CHARACTER = /\p{Script=Han}/u;

export function foldKana(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) - 0x60));
}

export function japaneseReading(name: string): string {
  let reading = foldKana(name);
  for (const [kanji, kana] of KANJI_READINGS) reading = reading.replaceAll(kanji, kana);
  return reading;
}

export function japaneseSortName(name: string): string {
  return HAN_CHARACTER.test(name) ? japaneseReading(name) : name;
}

