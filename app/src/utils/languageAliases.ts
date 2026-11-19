const UNIVERSAL_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  fil: ["tagalog", "pilipino", "tl"],
};

const BENGALI_ROMANIZED_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ar: ["arabi", "arbi"],
  bn: ["bangla", "bengali", "bangali"],
  de: ["jarman", "german", "germani"],
  en: ["ingreji", "english", "engreji"],
  es: ["spanish", "spenish"],
  fa: ["farsi", "parsi", "pharsi"],
  fr: ["farasi", "frenc", "french"],
  hi: ["hindi"],
  id: ["indonesia", "indonesian"],
  it: ["italiyan", "italian"],
  ja: ["japani", "japanese"],
  ko: ["koriyan", "korean"],
  ms: ["malay", "malaya"],
  ne: ["nepali"],
  pa: ["punjabi", "panjabi"],
  ru: ["rushiyan", "rashiyan", "russian"],
  ta: ["tamil"],
  te: ["telugu"],
  th: ["thai"],
  tr: ["turki", "turkish"],
  ur: ["urdu"],
  vi: ["vietnami", "vietnamese"],
  zh: ["chini", "cini", "chinese"],
};

const PORTUGUESE_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  af: ["africanes", "boer"],
  ca: ["valenciano"],
  cs: ["tcheco", "checo"],
  fa: ["farsi"],
  fil: ["tagalo"],
  hy: ["armenio"],
  nl: ["holandes", "neerlandes", "flamengo"],
  "pt-BR": ["brasileiro", "brasil"],
  "pt-PT": ["europeu", "lusitano", "portugal"],
  pl: ["polones", "polaco"],
  ps: ["pachto", "pasto"],
  uz: ["usbeque", "uzbeque"],
  zh: ["mandarim"],
};

const FRENCH_COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ar: ["maghreb", "arabie", "algerie", "maroc", "tunisie", "egypte", "liban", "darija"],
  bm: ["mali", "dioula"],
  br: ["bretagne", "breton"],
  co: ["corse"],
  eu: ["pays basque", "euskara"],
  ff: ["peul", "pulaar", "fulfulde", "senegal", "guinee"],
  ht: ["haiti", "creole"],
  crs: ["creole", "seychelles"],
  iu: ["inuit", "nunavut"],
  lb: ["luxembourg", "luxembourgeois"],
  ln: ["congo", "rdc", "kinshasa", "brazzaville"],
  mg: ["madagascar"],
  oc: ["provencal", "occitanie"],
  rn: ["burundi"],
  rw: ["rwanda"],
  sg: ["centrafrique"],
  sw: ["afrique de l'est", "kenya", "tanzanie"],
  ca: ["catalogne", "catalan", "valencien"],
  cs: ["tchequie", "republique tcheque"],
  da: ["danemark"],
  de: ["allemagne", "autriche", "suisse alemanique"],
  el: ["grece"],
  en: ["angleterre", "royaume-uni", "etats-unis", "usa", "amerique", "americain", "britannique"],
  es: ["espagne", "castillan", "mexique", "argentine"],
  fa: ["iran", "farsi"],
  fi: ["finlande"],
  he: ["israel"],
  hi: ["inde"],
  hu: ["hongrie"],
  id: ["indonesie", "bahasa"],
  it: ["italie"],
  ja: ["japon"],
  ko: ["coree"],
  ms: ["malaisie", "bahasa"],
  nl: ["hollande", "pays-bas", "flamand", "belgique"],
  no: ["norvege"],
  pl: ["pologne"],
  pt: ["portugal", "bresil", "bresilien"],
  ro: ["roumanie", "moldave"],
  ru: ["russie"],
  sv: ["suede"],
  th: ["thailande"],
  tr: ["turquie"],
  uk: ["ukraine"],
  ur: ["pakistan"],
  vi: ["viet nam", "vietnam"],
  zh: ["chine", "mandarin", "putonghua"],
};

const ALIASES_BY_UI_LANGUAGE: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  bn: BENGALI_ROMANIZED_ALIASES,
  fr: FRENCH_COUNTRY_ALIASES,
  pt: PORTUGUESE_LANGUAGE_ALIASES,
};

function includesNeedle(aliases: readonly string[] | undefined, needle: string): boolean {
  return aliases !== undefined && aliases.some((alias) => alias.includes(needle));
}

export function matchesLanguageAlias(code: string, needle: string, uiLanguage: string): boolean {
  const baseCode = code.split("-")[0];
  const uiAliases = ALIASES_BY_UI_LANGUAGE[uiLanguage];
  return includesNeedle(UNIVERSAL_LANGUAGE_ALIASES[baseCode], needle) || includesNeedle(uiAliases?.[code], needle) || includesNeedle(uiAliases?.[baseCode], needle);
}
