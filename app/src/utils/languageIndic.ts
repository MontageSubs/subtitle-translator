const INDIC_SCRIPT = /[\u0900-\u0D7F]/;
const INDIC_SCRIPT_GLOBAL = /[\u0980-\u0D7F]/g;
const DEVANAGARI_BLOCK_START = 0x900;
const INDIC_BLOCK_SIZE = 0x80;
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

const MALAYALAM_CHILLU_CONSONANTS: Readonly<Record<string, string>> = { "\u0D7A": "\u0923", "\u0D7B": "\u0928", "\u0D7C": "\u0930", "\u0D7D": "\u0932", "\u0D7E": "\u0933" };
const VOWEL_FOLD_PATTERN = new RegExp(`[${Object.keys(VOWEL_FOLDS).join("")}]`, "g");

const CONSONANT_SKELETON: Readonly<Record<string, string>> = {
  क: "k", ख: "k", ग: "g", घ: "g", ङ: "n", च: "c", छ: "c", ज: "j", झ: "j", ञ: "n",
  ट: "t", ठ: "t", ड: "d", ढ: "d", ण: "n", त: "t", थ: "t", द: "d", ध: "d", न: "n",
  प: "p", फ: "p", ब: "b", भ: "b", म: "m", य: "y", र: "r", ल: "l", ळ: "l", व: "v",
  श: "s", ष: "s", स: "s", ह: "h", ऴ: "j", "\u0902": "n",
};


interface SkeletonProfile {
  latinPrefold: (word: string) => string;
  scriptPrefold: (text: string) => string;
  postfold: (skeleton: string) => string;
}

const identity = (text: string): string => text;

const DEFAULT_PROFILE: SkeletonProfile = { latinPrefold: identity, scriptPrefold: identity, postfold: identity };

const TAMIL_PROFILE: SkeletonProfile = {
  latinPrefold: (word) => word.replace(/zh/g, "l"),
  scriptPrefold: (text) => text.replace(/\u0934/g, "\u0932"),
  postfold: (skeleton) => skeleton.replace(/[cj]/g, "s").replace(/g/g, "k").replace(/d/g, "t").replace(/b/g, "p"),
};

const PROFILE_BY_UI_LANGUAGE: Readonly<Record<string, SkeletonProfile>> = { ta: TAMIL_PROFILE };

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

const TAMIL_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ar: ["அரபு", "அரேபிய"],
  bn: ["பெங்காலி", "வங்காள"],
  cs: ["செக்"],
  da: ["டென்மார்க்"],
  de: ["ஜெர்மனி", "டாய்ச்"],
  el: ["கிரீக்", "கிரேக்க"],
  en: ["இங்கிலீஷ்", "ஆங்கிலேய"],
  es: ["ஸ்பெயின்", "ஸ்பானிஷ்"],
  fa: ["பாரசீகம்", "பெர்சியன்", "ஈரான்"],
  fi: ["பின்லாந்து"],
  fil: ["தகலாக்", "பிலிப்பைன்ஸ்"],
  fr: ["பிரெஞ்சு", "பிரஞ்சு", "பிரான்ஸ்"],
  he: ["ஹீப்ரு", "இஸ்ரேல்"],
  hi: ["ஹிந்தி"],
  hu: ["ஹங்கேரி"],
  id: ["பகாசா", "இந்தோனேஷிய"],
  it: ["இத்தாலி"],
  ja: ["ஜப்பான்", "ஜப்பானிய", "ஜப்பானீஸ்"],
  ko: ["கொரியா", "கொரிய"],
  ms: ["மலாய்", "மலேசியா", "பகாசா"],
  ne: ["நேபாளம்"],
  nl: ["டச்சு", "ஹாலந்து"],
  no: ["நார்வே"],
  pl: ["போலந்து", "போலிஷ்"],
  pt: ["போர்ச்சுகல்", "போர்ச்சுகீசு"],
  ro: ["ருமேனியா"],
  ru: ["ரஷ்யா", "ரஷ்ய"],
  si: ["சிங்களம்", "இலங்கை"],
  sv: ["ஸ்வீடன்"],
  th: ["தாய்லாந்து", "தாய்"],
  tr: ["துருக்கி"],
  uk: ["உக்ரைன்"],
  ur: ["பாகிஸ்தான்"],
  vi: ["வியட்நாம்"],
  zh: ["சீனா", "சீன", "மாண்டரின்"],
  "zh-Hans": ["எளிய சீன", "எளிமையாக்கப்பட்ட"],
  "zh-Hant": ["பாரம்பரிய சீன", "மரபுவழி"],
};

export const containsIndicScript = (text: string): boolean => INDIC_SCRIPT.test(text);

export function hindiLanguageAliases(code: string): readonly string[] {
  return HINDI_LANGUAGE_ALIASES[code] ?? HINDI_LANGUAGE_ALIASES[code.split("-")[0]] ?? [];
}

export function tamilLanguageAliases(code: string): readonly string[] {
  return TAMIL_LANGUAGE_ALIASES[code] ?? TAMIL_LANGUAGE_ALIASES[code.split("-")[0]] ?? [];
}

function toDevanagariBlock(text: string): string {
  return text
    .normalize("NFD")
    .replace(INDIC_SCRIPT_GLOBAL, (letter) => MALAYALAM_CHILLU_CONSONANTS[letter] ?? String.fromCharCode(DEVANAGARI_BLOCK_START + (letter.charCodeAt(0) % INDIC_BLOCK_SIZE)));
}

export function foldDevanagari(text: string): string {
  return toDevanagariBlock(text)
    .replace(JOINERS_AND_NUKTA, "")
    .replace(NASAL_BEFORE_CONSONANT, "\u0902")
    .replace(VOWEL_FOLD_PATTERN, (mark) => VOWEL_FOLDS[mark])
    .normalize("NFC");
}

function latinWordSkeleton(word: string, profile: SkeletonProfile): string {
  return profile.postfold(
    profile
      .latinPrefold(word.toLowerCase())
      .replace(LATIN_DIGRAPH, (digraph) => digraph[0])
      .replace(/[zfqwx]/g, (letter) => LATIN_LETTER_SKELETON[letter])
      .replace(/[^a-z]|[aeiou]/g, "")
      .replace(REPEATED_LETTER, "$1"),
  );
}

function indicWordSkeleton(word: string, profile: SkeletonProfile): string {
  let skeleton = "";
  for (const letter of profile.scriptPrefold(foldDevanagari(word)).normalize("NFD")) skeleton += CONSONANT_SKELETON[letter] ?? "";
  return profile.postfold(skeleton.replace(REPEATED_LETTER, "$1"));
}

function wordSkeletons(text: string, profile: SkeletonProfile): string[] {
  return text
    .split(WORD_SPLIT)
    .map((word) => (INDIC_SCRIPT.test(word) ? indicWordSkeleton(word, profile) : latinWordSkeleton(word, profile)))
    .filter((skeleton) => skeleton.length > 0);
}

export function matchesIndicQuery(needle: string, names: readonly string[], uiLanguage: string): boolean {
  if (INDIC_SCRIPT.test(needle)) {
    const foldedNeedle = foldDevanagari(needle);
    return names.some((name) => foldDevanagari(name).includes(foldedNeedle));
  }
  if (needle.length < MIN_LATIN_QUERY_LENGTH) return false;
  const profile = PROFILE_BY_UI_LANGUAGE[uiLanguage] ?? DEFAULT_PROFILE;
  const query = latinWordSkeleton(needle, profile);
  if (query.length < MIN_SKELETON_LENGTH) return false;
  return names.some((name) => wordSkeletons(name, profile).some((skeleton) => skeleton.startsWith(query)));
}
