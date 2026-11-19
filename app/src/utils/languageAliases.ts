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

const FRENCH_COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ar: ["maghreb", "arabie", "algérie", "algerie", "maroc", "tunisie", "egypte", "égypte", "liban", "darija"],
  bm: ["mali", "dioula"],
  br: ["bretagne", "breton"],
  co: ["corse"],
  eu: ["pays basque", "euskara"],
  ff: ["peul", "pulaar", "fulfulde", "sénégal", "senegal", "guinée", "guinee"],
  ht: ["haïti", "haiti", "créole", "creole"],
  crs: ["créole", "creole", "seychelles"],
  iu: ["inuit", "nunavut"],
  lb: ["luxembourg", "luxembourgeois"],
  ln: ["congo", "rdc", "kinshasa", "brazzaville"],
  mg: ["madagascar"],
  oc: ["provençal", "provencal", "occitanie"],
  rn: ["burundi"],
  rw: ["rwanda"],
  sg: ["centrafrique"],
  sw: ["afrique de l’est", "afrique de l'est", "kenya", "tanzanie"],
  ca: ["catalogne", "catalan", "valencien"],
  cs: ["tchéquie", "tchequie", "république tchèque", "republique tcheque"],
  da: ["danemark"],
  de: ["allemagne", "autriche", "suisse alémanique"],
  el: ["grèce", "grece"],
  en: ["angleterre", "royaume-uni", "états-unis", "etats-unis", "usa", "amérique", "amerique", "américain", "americain", "britannique"],
  es: ["espagne", "castillan", "mexique", "argentine"],
  fa: ["iran", "farsi"],
  fi: ["finlande"],
  he: ["israël", "israel"],
  hi: ["inde"],
  hu: ["hongrie"],
  id: ["indonésie", "indonesie", "bahasa"],
  it: ["italie"],
  ja: ["japon"],
  ko: ["corée", "coree"],
  ms: ["malaisie", "bahasa"],
  nl: ["hollande", "pays-bas", "flamand", "belgique"],
  no: ["norvège", "norvege"],
  pl: ["pologne"],
  pt: ["portugal", "brésil", "bresil", "brésilien", "bresilien"],
  ro: ["roumanie", "moldave"],
  ru: ["russie"],
  sv: ["suède", "suede"],
  th: ["thaïlande", "thailande"],
  tr: ["turquie"],
  uk: ["ukraine"],
  ur: ["pakistan"],
  vi: ["viêt nam", "viet nam", "vietnam"],
  zh: ["chine", "mandarin", "putonghua"],
};

const ROMANIZED_ALIASES_BY_UI_LANGUAGE: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  bn: BENGALI_ROMANIZED_ALIASES,
  fr: FRENCH_COUNTRY_ALIASES,
};

function includesNeedle(aliases: readonly string[] | undefined, needle: string): boolean {
  return aliases !== undefined && aliases.some((alias) => alias.includes(needle));
}

export function matchesLanguageAlias(code: string, needle: string, uiLanguage: string): boolean {
  const baseCode = code.split("-")[0];
  return includesNeedle(UNIVERSAL_LANGUAGE_ALIASES[baseCode], needle) || includesNeedle(ROMANIZED_ALIASES_BY_UI_LANGUAGE[uiLanguage]?.[baseCode], needle);
}
