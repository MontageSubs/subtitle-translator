export interface LineBreakRule {
  noLineStart: Set<string>;
  noLineEnd: Set<string>;
  avoidTrailing: Set<string>;
}

const CJK_NO_START = "。，、！？；：）】』」》〉’”·…";
const CJK_NO_END = "（【『「《〈‘“";
const UNIVERSAL_NO_START = `.,;:!?)]}%’”»›${CJK_NO_START}`;
const UNIVERSAL_NO_END = `([{«‹“‘${CJK_NO_END}`;

const AVOID_TRAILING: Record<string, string[]> = {
  en: ["a", "an", "the", "of", "to", "in", "on", "at", "and", "or", "but", "for", "with", "as", "by"],
  es: ["el", "la", "los", "las", "de", "del", "y", "o", "a", "en", "por", "con", "que", "un", "una"],
  fr: ["le", "la", "les", "de", "du", "des", "et", "ou", "à", "en", "que", "qui", "un", "une"],
  de: ["der", "die", "das", "und", "oder", "zu", "in", "auf", "mit", "von", "ein", "eine"],
  it: ["il", "lo", "la", "i", "gli", "le", "di", "e", "o", "a", "in", "con", "che", "un", "una"],
  pt: ["o", "a", "os", "as", "de", "do", "da", "e", "ou", "em", "com", "que", "um", "uma"],
  nl: ["de", "het", "een", "en", "of", "van", "te", "in", "op", "met"],
  pl: ["i", "w", "z", "na", "do", "się", "że", "o", "a"],
  sv: ["och", "eller", "av", "i", "på", "med", "till", "en", "ett"],
  da: ["og", "eller", "af", "i", "på", "med", "til", "en", "et"],
  no: ["og", "eller", "av", "i", "på", "med", "til", "en", "et"],
  fi: ["ja", "tai", "on", "se", "että"],
  ro: ["și", "sau", "de", "la", "cu", "un", "o"],
  cs: ["a", "nebo", "v", "na", "s", "že"],
  hu: ["és", "vagy", "a", "az", "hogy"],
  tr: ["ve", "veya", "bir", "bu", "için", "ile"],
  id: ["dan", "atau", "yang", "di", "ke", "dari"],
  vi: ["và", "hoặc", "là", "của", "ở"],
  ru: ["и", "в", "на", "с", "к", "по", "от", "за", "из", "а", "но"],
  uk: ["і", "в", "на", "з", "до", "від", "за", "із", "а", "але"],
  el: ["και", "ή", "το", "η", "ο", "του", "της"],
};

export function languageBreakRule(baseCode: string): LineBreakRule {
  return {
    noLineStart: new Set(UNIVERSAL_NO_START),
    noLineEnd: new Set(UNIVERSAL_NO_END),
    avoidTrailing: new Set(AVOID_TRAILING[baseCode] || []),
  };
}
