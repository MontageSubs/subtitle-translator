import { KeyboardLayout, matchesArabicScriptQuery } from "./arabicScript";

const NO_KEYBOARD_LAYOUT: KeyboardLayout = {};

const URDU_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  af: ["جنوبی افریقہ", "افریقانس", "afrikaans"],
  ar: ["عرب", "سعودی", "عربستان", "arabi", "arbi", "arab", "saudi"],
  az: ["آذربائیجان", "آذری", "azeri", "azerbaijan"],
  bn: ["بنگلہ", "بنگلہ دیش", "بنگال", "bengali", "bangla", "bangali", "bangladesh"],
  ckb: ["کردستان", "کرد", "سورانی", "kurdi", "kurdish", "sorani"],
  cs: ["چیکیا", "چیک ریپبلک", "czech"],
  da: ["ڈنمارک", "danish", "denmark"],
  de: ["جرمنی", "jarman", "german", "germany", "jermani"],
  el: ["یونان", "یونانی", "greek", "yunani", "greece"],
  en: ["انگلش", "انگلینڈ", "برطانیہ", "برطانوی", "امریکہ", "امریکی", "angrezi", "angraizi", "angrezee", "english", "inglish", "england", "britain", "amreeki", "american"],
  es: ["سپین", "اسپین", "ہسپانیہ", "سپینش", "spanish", "spain", "espanol", "hispani"],
  fa: ["ایران", "ایرانی", "پارسی", "farsi", "parsi", "irani", "iran"],
  fi: ["فن لینڈ", "finnish", "finland"],
  fil: ["فلپائن", "تاگالوگ", "filipino", "tagalog", "philippines"],
  fr: ["فرانس", "فرانسیسی", "فرنچ", "french", "faransisi", "france", "fransisi"],
  gu: ["گجرات", "گجراتی", "gujarati", "gujrati"],
  ha: ["نائیجیریا", "ہوسا", "hausa"],
  he: ["اسرائیل", "عبرانی", "ibrani", "hebrew", "israel"],
  hi: ["بھارت", "ہندوستان", "ہندوستانی", "انڈیا", "hindi", "hindustani", "bharat", "india", "hindustan"],
  hu: ["ہنگری", "hungarian", "hungary"],
  id: ["انڈونیشیا", "بہاسا", "indonesi", "indonesia", "bahasa"],
  it: ["اٹلی", "اطالوی", "italian", "italvi", "italy", "italiyan"],
  ja: ["جاپان", "جاپانی", "japani", "japan", "japanese"],
  ko: ["کوریا", "کوریائی", "korean", "koriai", "korea", "koria"],
  ks: ["کشمیر", "کشمیری", "kashmiri", "kashmir"],
  mr: ["مہاراشٹر", "marathi"],
  ms: ["ملائیشیا", "ملائی", "بہاسا", "malay", "malaysia", "bahasa"],
  ne: ["نیپال", "نیپالی", "nepali", "nepal"],
  nl: ["ہالینڈ", "ڈچ", "نیدرلینڈز", "dutch", "holland", "netherlands"],
  no: ["ناروے", "نارویجین", "norwegian", "norway"],
  pa: ["پنجاب", "گورمکھی", "punjabi", "panjabi", "gurmukhi", "punjab"],
  "pa-Arab": ["پنجاب", "پنجابی", "شاہ مکھی", "شاہ مُکھی", "punjabi", "panjabi", "shahmukhi", "shah mukhi", "punjab"],
  pl: ["پولینڈ", "polish", "poland"],
  ps: ["پختون", "پشتون", "افغان", "افغانستان", "pashto", "pukhto", "pakhto", "pathan", "pashtun", "afghan", "afghani"],
  pt: ["پرتگال", "برازیل", "پرتگالی", "portuguese", "portugal", "brazil", "purtagali", "portugali"],
  ro: ["رومانیہ", "romanian", "romania"],
  ru: ["روس", "روسی", "rusi", "roosi", "russia", "russian"],
  sd: ["سندھ", "سندھی", "sindhi", "sindh"],
  si: ["سری لنکا", "سنہالی", "sinhala", "srilanka", "sri lanka"],
  sv: ["سویڈن", "swedish", "sweden"],
  sw: ["کینیا", "تنزانیہ", "سواحیلی", "swahili", "kenya", "tanzania"],
  ta: ["تامل ناڈو", "تملی", "tamil", "taamil"],
  te: ["آندھرا", "تیلگو", "telugu"],
  tg: ["تاجکستان", "tajik", "tajiki"],
  th: ["تھائی لینڈ", "thai", "thailand"],
  tr: ["ترکیہ", "ترکیے", "ترکش", "turki", "torki", "turkey", "turkiye", "turkish"],
  ug: ["ایغور", "اویغور", "uyghur", "uighur", "xinjiang"],
  uk: ["یوکرین", "ukrainian", "ukraine"],
  ur: ["پاکستان", "پاکستانی", "urdu", "pakistan", "pakistani"],
  uz: ["ازبکستان", "uzbek", "uzbeki", "uzbekistan"],
  vi: ["ویتنام", "vietnami", "vietnam", "vietnamese"],
  zh: ["چین", "چینی", "مینڈرن", "chini", "cheeni", "china", "chinese", "mandarin"],
};

export function urduLanguageAliases(code: string): readonly string[] {
  return URDU_LANGUAGE_ALIASES[code] ?? URDU_LANGUAGE_ALIASES[code.split("-")[0]] ?? [];
}

export const matchesUrduQuery = (needle: string, haystacks: readonly string[]): boolean => matchesArabicScriptQuery(needle, haystacks, NO_KEYBOARD_LAYOUT);
