export interface ParsedLanguageTag {
  language: string;
  script?: string;
  region?: string;
}

export const LEGACY_SCRIPTS: Readonly<Record<string, string>> = { cht: "Hant", chs: "Hans" };
export const TRADITIONAL_REGIONS: readonly string[] = ["TW", "HK", "MO"];
export const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  nb: "no", nn: "no", in: "id", iw: "he", ji: "yi", tl: "fil",
  acm: "ar", afb: "ar", ajp: "ar", apc: "ar", arz: "ar", ary: "ar",
  pes: "fa", prs: "fa",
};

function normalizeTag(tag: string): string {
  return tag.split(";")[0].trim().replace(/_/g, "-");
}

export function parseLanguageTag(tag: string): ParsedLanguageTag {
  const [language = "", ...subtags] = normalizeTag(tag).split("-");
  const parsed: ParsedLanguageTag = { language: language.toLowerCase() };
  for (const subtag of subtags) {
    const lower = subtag.toLowerCase();
    if (!parsed.script && (lower in LEGACY_SCRIPTS || /^[a-z]{4}$/.test(lower))) {
      parsed.script = LEGACY_SCRIPTS[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
    } else if (!parsed.region && /^([a-z]{2}|\d{3})$/.test(lower)) {
      parsed.region = subtag.toUpperCase();
    }
  }
  return parsed;
}

export function inferScript({ language, script, region }: ParsedLanguageTag): string | undefined {
  if (script || language !== "zh") return script;
  return region && TRADITIONAL_REGIONS.includes(region) ? "Hant" : "Hans";
}

const REGIONAL_NORMS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  pt: { AO: "PT", CV: "PT", GQ: "PT", GW: "PT", MO: "PT", MZ: "PT", ST: "PT", TL: "PT" },
};

export const RELATED_INTERFACE_LANGUAGES: Readonly<Record<string, readonly string[]>> = {
  an: ["es"], ast: ["es"], ay: ["es"], ca: ["es", "fr"], eu: ["es", "fr"], gl: ["es", "pt-PT"], gn: ["es"], lad: ["es"], nah: ["es"], qu: ["es"],
  br: ["fr"], co: ["fr", "it"], ht: ["fr"], kab: ["fr"], oc: ["fr", "es"], wa: ["fr"], wo: ["fr"], bm: ["fr"], ln: ["fr"],
  lij: ["it"], lmo: ["it"], nap: ["it"], pms: ["it"], scn: ["it"], vec: ["it"], fur: ["it"], sc: ["it"],
  kea: ["pt-PT"], mwl: ["pt-PT"], tet: ["pt-PT"],
  gsw: ["de"], lb: ["de", "fr"], rm: ["de"],
  ace: ["id"], ban: ["id"], bew: ["id"], bug: ["id"], jv: ["id"], mad: ["id"], mak: ["id"], min: ["id"], su: ["id"],
  awa: ["hi"], bho: ["hi"], hne: ["hi"], mag: ["hi"], mai: ["hi"], raj: ["hi"],
  ba: ["ru"], be: ["ru"], ce: ["ru"], cv: ["ru"], kk: ["ru"], kv: ["ru"], ky: ["ru"], mhr: ["ru"], myv: ["ru"], os: ["ru"], sah: ["ru"], tg: ["ru"], tt: ["ru"], udm: ["ru"],
  rue: ["uk"], csb: ["pl"], szl: ["pl"],
  az: ["tr"], gag: ["tr", "ru"], tk: ["tr", "ru"], kaa: ["uz"],
};

const canonicalLanguage = (language: string): string => LANGUAGE_ALIASES[language] ?? language;

function resolveLanguageAssociation(candidate: string, supported: readonly string[]): string | undefined {
  const normalized = normalizeTag(candidate).toLowerCase();
  const exact = supported.find((code) => code.toLowerCase() === normalized);
  if (exact) return exact;
  const wanted = parseLanguageTag(normalized);
  if (!wanted.language) return undefined;
  const script = inferScript(wanted);
  const region = wanted.region && (REGIONAL_NORMS[wanted.language]?.[wanted.region] ?? wanted.region);
  const family = supported.filter((code) => canonicalLanguage(parseLanguageTag(code).language) === canonicalLanguage(wanted.language));
  return (
    family.find((code) => script && inferScript(parseLanguageTag(code)) === script) ??
    family.find((code) => region && parseLanguageTag(code).region === region) ??
    family[0]
  );
}

export function matchPreferredLocale(preferences: readonly string[], supported: readonly string[], fallback: string): string {
  for (const candidate of preferences) {
    const resolved = candidate && resolveLanguageAssociation(candidate, supported);
    if (resolved) return resolved;
  }
  return fallback;
}

function resolveRelatedInterfaceLanguage(candidate: string, supported: readonly string[]): string | undefined {
  const { language } = parseLanguageTag(candidate);
  for (const related of RELATED_INTERFACE_LANGUAGES[canonicalLanguage(language)] ?? []) {
    const resolved = resolveLanguageAssociation(related, supported);
    if (resolved) return resolved;
  }
  return undefined;
}

export function matchInterfaceLocale(preferences: readonly string[], supported: readonly string[], fallback: string): string {
  for (const candidate of preferences) {
    const resolved = candidate && (resolveLanguageAssociation(candidate, supported) ?? resolveRelatedInterfaceLanguage(candidate, supported));
    if (resolved) return resolved;
  }
  return fallback;
}
