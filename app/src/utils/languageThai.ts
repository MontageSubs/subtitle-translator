const THAI_SCRIPT = /[\u0e00-\u0e7f]/;
const TONE_MARKS_AND_JOINERS = /[\u0e48-\u0e4b\u200b-\u200d]/g;
const DECOMPOSED_SARA_AM = /\u0e4d\u0e32/g;
const LANGUAGE_PREFIX = /^ภาษา\s*/;
const LATIN_KEYS = /^[a-z;,./'[\]\\`\d-]+$/;
const THAI_KEYS = /^[\u0e01-\u0e5b\s]+$/;
const MIN_LAYOUT_QUERY_LENGTH = 2;

const THAI_BY_LATIN_KEY: Readonly<Record<string, string>> = {
  q: "ๆ", w: "ไ", e: "ำ", r: "พ", t: "ะ", y: "ั", u: "ี", i: "ร", o: "น", p: "ย", "[": "บ", "]": "ล", "\\": "ฃ",
  a: "ฟ", s: "ห", d: "ก", f: "ด", g: "เ", h: "้", j: "่", k: "า", l: "ส", ";": "ว", "'": "ง",
  z: "ผ", x: "ป", c: "แ", v: "อ", b: "ิ", n: "ื", m: "ท", ",": "ม", ".": "ใ", "/": "ฝ",
  "1": "ๅ", "2": "/", "3": "-", "4": "ภ", "5": "ถ", "6": "ุ", "7": "ึ", "8": "ค", "9": "ต", "0": "จ", "-": "ข",
};

const SHIFTED_THAI_BY_LATIN_KEY: Readonly<Record<string, string>> = {
  q: "๐", w: "\"", e: "ฎ", r: "ฑ", t: "ธ", y: "ํ", u: "๊", i: "ณ", o: "ฯ", p: "ญ", "[": "ฐ", "]": ",", "\\": "ฅ",
  a: "ฤ", s: "ฆ", d: "ฏ", f: "โ", g: "ฌ", h: "็", j: "๋", k: "ษ", l: "ศ", ";": "ซ", "'": ".",
  z: "(", x: ")", c: "ฉ", v: "ฮ", b: "ฺ", n: "์", m: "?", ",": "ฒ", ".": "ฬ", "/": "ฦ",
};

const LATIN_BY_THAI_KEY: Readonly<Record<string, string>> = Object.fromEntries(
  [THAI_BY_LATIN_KEY, SHIFTED_THAI_BY_LATIN_KEY].flatMap((layer) => Object.entries(layer).map(([latin, thai]) => [thai, latin])),
);

const THAI_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ar: ["ซาอุ", "ซาอุดีอาระเบีย"],
  bn: ["บังกลา", "บังกลาเทศ", "บังคลาเทศ", "เบงกอล", "เบงกาลี"],
  de: ["เยอรมนี", "เยอรมานี", "เจอร์มัน"],
  el: ["กรีซ"],
  en: ["อเมริกา", "อเมริกัน", "เมกา", "บริติช", "ออสเตรเลีย"],
  es: ["เม็กซิโก", "ละตินอเมริกา"],
  fa: ["อิหร่าน", "อีหร่าน"],
  fil: ["ตากาล็อก", "ตากาลอก", "ฟิลิปปิน"],
  fr: ["ฝรั่งเศส"],
  he: ["ฮิบรู", "อิสราเอล", "อิสราเอลี"],
  hi: ["อินเดีย", "ฮินดี"],
  id: ["อินโด", "บาฮาซา", "อินโดนีเซีย"],
  it: ["อิตาลี", "อิตาเลียน"],
  ja: ["นิฮงโกะ", "ญี่ปุ่น"],
  km: ["กัมพูชา", "เขมร"],
  ko: ["ฮันกุก", "ฮันกูโกะ", "เกาหลีใต้", "โคเรีย", "เกาหลี"],
  lo: ["อีสาน"],
  ms: ["มลายู", "มาเลเซีย", "บาฮาซา"],
  my: ["เมียนมา", "เมียนมาร์", "พม่า", "พะม่า"],
  nl: ["ฮอลแลนด์", "เนเธอร์แลนด์", "ดัตช์"],
  pl: ["โปแลนด์"],
  pt: ["บราซิล", "โปรตุเกส"],
  ru: ["รัสเซีย"],
  sv: ["สวีเดน"],
  tr: ["ตุรกี", "เติร์ก", "เตอร์กี", "เตอร์กิช"],
  uk: ["ยูเครน"],
  ur: ["ปากีสถาน"],
  vi: ["เวียตนาม", "เวียดนาม"],
  yue: ["ฮ่องกง", "กวางตุ้ง"],
  zh: ["จีนกลาง", "แมนดาริน"],
  "zh-Hans": ["จีนกลาง", "แมนดาริน", "ตัวย่อ", "จีนแผ่นดินใหญ่"],
  "zh-Hant": ["ไต้หวัน", "ฮ่องกง", "ตัวเต็ม"],
};

export const containsThai = (text: string): boolean => THAI_SCRIPT.test(text);

export function thaiLanguageAliases(code: string): readonly string[] {
  return THAI_LANGUAGE_ALIASES[code] ?? THAI_LANGUAGE_ALIASES[code.split("-")[0]] ?? [];
}

export const normalizeThai = (text: string): string => text.toLowerCase().replace(DECOMPOSED_SARA_AM, "\u0e33").replace(TONE_MARKS_AND_JOINERS, "");

const remap = (text: string, table: Readonly<Record<string, string>>): string => [...text].map((character) => table[character] ?? character).join("");

function thaiQueryForms(needle: string): string[] {
  const bare = needle.replace(LANGUAGE_PREFIX, "");
  const forms = [bare];
  if (bare.length >= MIN_LAYOUT_QUERY_LENGTH) {
    if (LATIN_KEYS.test(bare)) forms.push(remap(bare, THAI_BY_LATIN_KEY));
    else if (THAI_KEYS.test(bare)) forms.push(remap(bare, LATIN_BY_THAI_KEY));
  }
  return forms.map(normalizeThai).filter(Boolean);
}

export function matchesThaiQuery(needle: string, haystacks: readonly string[]): boolean {
  const forms = thaiQueryForms(needle);
  if (forms.length === 0) return true;
  const normalized = haystacks.map(normalizeThai);
  return forms.some((form) => normalized.some((text) => text.includes(form)));
}
