const DEVANAGARI = /[\u0900-\u097F]/;
const JOINERS_AND_NUKTA = /[\u093C\u200C\u200D]/g;
const NASAL_BEFORE_CONSONANT = /[ङञणनम]\u094D(?=[क-ह])/g;

const VOWEL_FOLDS: Readonly<Record<string, string>> = {
  "\u0901": "\u0902",
  "\u0940": "\u093F",
  "\u0942": "\u0941",
  "\u0945": "\u0947",
  "\u0949": "\u094B",
  "\u0908": "\u0907",
  "\u090A": "\u0909",
  "\u090D": "\u090F",
  "\u0911": "\u0913",
};
const VOWEL_FOLD_PATTERN = new RegExp(`[${Object.keys(VOWEL_FOLDS).join("")}]`, "g");

const CONSONANT_SKELETON: Readonly<Record<string, string>> = {
  क: "k", ख: "k", ग: "g", घ: "g", ङ: "n", च: "c", छ: "c", ज: "j", झ: "j", ञ: "n",
  ट: "t", ठ: "t", ड: "d", ढ: "d", ण: "n", त: "t", थ: "t", द: "d", ध: "d", न: "n",
  प: "p", फ: "p", ब: "b", भ: "b", म: "m", य: "y", र: "r", ल: "l", ळ: "l", व: "v",
  श: "s", ष: "s", स: "s", ह: "h", "\u0902": "n",
};

const LATIN_DIGRAPH = /(sh|ch|kh|gh|th|dh|ph|bh|jh|zh)/g;
const LATIN_LETTER_SKELETON: Readonly<Record<string, string>> = { z: "j", f: "p", q: "k", w: "v", x: "ks" };
const REPEATED_LETTER = /(.)\1+/g;
const WORD_SPLIT = /[\s()\-,/]+/;
const MIN_SKELETON_LENGTH = 2;
const MIN_LATIN_QUERY_LENGTH = 3;

const HINDI_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  af: ["अफ़्रीकान्स"],
  ar: ["अरेबिक", "अरब"],
  bn: ["बंगाली", "बंगला", "बाँग्ला"],
  cs: ["चेकोस्लोवाक", "चेकिया"],
  da: ["डेनमार्क"],
  de: ["जर्मनी", "डॉयच"],
  el: ["यूनानी", "ग्रीस"],
  en: ["इंग्लिश", "ब्रिटिश", "अमेरिकी"],
  es: ["स्पैनिश", "स्पेन"],
  fa: ["फारसी", "पर्शियन", "ईरान"],
  fi: ["फ़िनलैंड"],
  fil: ["तागालोग", "फिलीपींस"],
  fr: ["फ्रांसीसी", "फ्रांस"],
  gu: ["गुज़राती"],
  he: ["इब्रानी", "इज़राइल"],
  hu: ["हंगरी"],
  id: ["बहासा", "इंडोनेशिया"],
  it: ["इटैलियन", "इटली"],
  ja: ["जैपनीज़", "जापान"],
  kn: ["कन्नडा"],
  ko: ["कोरियन", "कोरिया"],
  ml: ["मलयाळम"],
  ms: ["मलेशिया", "बहासा"],
  ne: ["नेपाल"],
  nl: ["हॉलैंड", "नीदरलैंड", "डच"],
  no: ["नॉर्वे", "नार्वेजियन"],
  or: ["उड़िया", "ओडिया"],
  pa: ["गुरमुखी"],
  pl: ["पोलैंड"],
  pt: ["पुर्तगीज़", "पोर्चुगीज़"],
  ro: ["रोमानिया"],
  ru: ["रशियन", "रूस"],
  si: ["श्रीलंका", "सिंहल"],
  sv: ["स्वीडन"],
  ta: ["तमिळ"],
  te: ["तेलगू"],
  th: ["थाईलैंड"],
  tr: ["तुर्किश", "तुर्किये"],
  uk: ["यूक्रेन"],
  ur: ["पाकिस्तान"],
  vi: ["वियतनाम"],
  zh: ["चाइनीज़", "मंदारिन", "चीन"],
  "zh-Hans": ["चाइनीज़ सरल", "सरल"],
  "zh-Hant": ["चाइनीज़ पारंपरिक", "पारंपरिक"],
};

export const containsDevanagari = (text: string): boolean => DEVANAGARI.test(text);

export function hindiLanguageAliases(code: string): readonly string[] {
  return HINDI_LANGUAGE_ALIASES[code] ?? HINDI_LANGUAGE_ALIASES[code.split("-")[0]] ?? [];
}

export function foldDevanagari(text: string): string {
  return text
    .normalize("NFD")
    .replace(JOINERS_AND_NUKTA, "")
    .replace(NASAL_BEFORE_CONSONANT, "\u0902")
    .replace(VOWEL_FOLD_PATTERN, (mark) => VOWEL_FOLDS[mark])
    .normalize("NFC");
}

function latinWordSkeleton(word: string): string {
  return word
    .toLowerCase()
    .replace(LATIN_DIGRAPH, (digraph) => digraph[0])
    .replace(/[zfqwx]/g, (letter) => LATIN_LETTER_SKELETON[letter])
    .replace(/[^a-z]|[aeiou]/g, "")
    .replace(REPEATED_LETTER, "$1");
}

function devanagariWordSkeleton(word: string): string {
  let skeleton = "";
  for (const letter of foldDevanagari(word).normalize("NFD")) skeleton += CONSONANT_SKELETON[letter] ?? "";
  return skeleton.replace(REPEATED_LETTER, "$1");
}

function wordSkeletons(text: string): string[] {
  return text
    .split(WORD_SPLIT)
    .map((word) => (DEVANAGARI.test(word) ? devanagariWordSkeleton(word) : latinWordSkeleton(word)))
    .filter((skeleton) => skeleton.length > 0);
}

export function matchesHindiQuery(needle: string, names: readonly string[]): boolean {
  if (DEVANAGARI.test(needle)) {
    const foldedNeedle = foldDevanagari(needle);
    return names.some((name) => foldDevanagari(name).includes(foldedNeedle));
  }
  if (needle.length < MIN_LATIN_QUERY_LENGTH) return false;
  const query = latinWordSkeleton(needle);
  if (query.length < MIN_SKELETON_LENGTH) return false;
  return names.some((name) => wordSkeletons(name).some((skeleton) => skeleton.startsWith(query)));
}
