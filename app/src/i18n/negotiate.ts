export interface ParsedLanguageTag {
  language: string;
  script?: string;
  region?: string;
}

export const LEGACY_SCRIPTS: Readonly<Record<string, string>> = { cht: "Hant", chs: "Hans" };
export const TRADITIONAL_REGIONS: readonly string[] = ["TW", "HK", "MO"];
export const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  nb: "no", nn: "no", in: "id", iw: "he", ji: "yi", tl: "fil", tgl: "fil",
  acm: "ar", acq: "ar", acw: "ar", acx: "ar", adf: "ar", aeb: "ar", afb: "ar", ajp: "ar", apc: "ar", apd: "ar", arq: "ar", ars: "ar", arz: "ar", ary: "ar", auz: "ar", avl: "ar", ayh: "ar", ayl: "ar", ayn: "ar", ayp: "ar", shu: "ar",
  pes: "fa", prs: "fa",
  kmr: "ku", swc: "sw", swh: "sw", uzn: "uz", uzs: "uz", zsm: "ms", zlm: "ms",
  quz: "qu", quy: "qu", qvi: "qu", qug: "qu", qwh: "qu", qxn: "qu", qvc: "qu",
  aym: "ay", ayr: "ay", grn: "gn",
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

export const REGIONAL_NORMS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  pt: { AD: "PT", AO: "PT", CH: "PT", CV: "PT", FR: "PT", GQ: "PT", GW: "PT", LU: "PT", MO: "PT", MZ: "PT", ST: "PT", TL: "PT" },
};

export const RELATED_INTERFACE_LANGUAGES: Readonly<Record<string, readonly string[]>> = {
  an: ["es"], ast: ["es"], ay: ["es"], ca: ["es", "fr"], eu: ["es", "fr"], gl: ["es", "pt-PT"], gn: ["es"], lad: ["es"], nah: ["es"], nhe: ["es"], nhn: ["es"], nhw: ["es"], qu: ["es"], arn: ["es"], yua: ["es"],
  br: ["fr"], co: ["fr", "it"], ht: ["fr"], kab: ["fr"], oc: ["fr", "es"], wa: ["fr"], wo: ["fr"], bm: ["fr"], ln: ["fr"], ff: ["fr"], mg: ["fr"], sg: ["fr"], kg: ["fr"], ktu: ["fr"], lua: ["fr"],
  mfe: ["fr"], gcr: ["fr"], rcf: ["fr"], acf: ["fr"], gcf: ["fr"], lou: ["fr"], crs: ["fr"], ty: ["fr"], rif: ["ar", "fr"], shi: ["ar", "fr"], tzm: ["ar", "fr"], zgh: ["ar", "fr"], tmh: ["ar", "fr"],
  lij: ["it"], lmo: ["it"], nap: ["it"], pms: ["it"], scn: ["it"], vec: ["it"], fur: ["it"], sc: ["it"], rgn: ["it"], egl: ["it"], lld: ["it"], sdc: ["it"],
  kea: ["pt-PT"], mwl: ["pt-PT"], tet: ["pt-PT"], cri: ["pt-PT"], pov: ["pt-PT"], nhd: ["pt-BR"],
  gsw: ["de"], lb: ["de", "fr"], rm: ["de"], bar: ["de"], ksh: ["de"], nds: ["de"], pdc: ["de"], wae: ["de"], hsb: ["de"], dsb: ["de"],
  "lad-IL": ["he"], "yi-IL": ["he"],
  ace: ["id"], ban: ["id"], bbc: ["id"], bew: ["id"], bjn: ["id"], btk: ["id"], btx: ["id"], bts: ["id"], bug: ["id"], gor: ["id"], jv: ["id"], ljp: ["id"], mad: ["id"], mak: ["id"], min: ["id"], rej: ["id"], sas: ["id"], su: ["id"],
  awa: ["hi"], bgc: ["hi"], bho: ["hi"], gbm: ["hi"], hif: ["hi"], hne: ["hi"], kfy: ["hi"], mag: ["hi"], mai: ["hi"], mwr: ["hi"], raj: ["hi"],
  gu: ["hi"], mr: ["hi"], ne: ["hi"], pa: ["hi"], sa: ["hi"], doi: ["hi", "ur"], "pa-Arab": ["ur"], "pa-PK": ["ur"], "sd-Deva": ["hi"], "sd-IN": ["hi"],
  as: ["bn", "hi"], bpy: ["bn"], ctg: ["bn"], rhg: ["bn"], rkt: ["bn"], syl: ["bn"],
  bal: ["ur"], "bal-IR": ["fa"], brh: ["ur"], hno: ["ur"], ks: ["ur"], lah: ["ur"], pnb: ["ur"], ps: ["ur", "fa"], "ps-AF": ["fa"], "ps-PK": ["ur"], sd: ["ur"], skr: ["ur"],
  bcl: ["fil"], bto: ["fil"], cbk: ["fil"], ceb: ["fil"], hil: ["fil"], ilo: ["fil"], krj: ["fil"], mdh: ["fil"], mrw: ["fil"], pag: ["fil"], pam: ["fil"], sgd: ["fil"], tsg: ["fil"], war: ["fil"],
  nod: ["th"], sou: ["th"], tts: ["th"], lo: ["th"],
  cjm: ["vi"], "hmn-VN": ["vi"], "hnj-VN": ["vi"], "km-VN": ["vi"],
  jje: ["ko"],
  ain: ["ja"], ams: ["ja"], mvi: ["ja"], rys: ["ja"], ryu: ["ja"], xug: ["ja"],
  yue: ["zh-Hant"], "yue-CN": ["zh-Hans"], "yue-Hans": ["zh-Hans"], lzh: ["zh-Hant"],
  cmn: ["zh-Hans"], "cmn-HK": ["zh-Hant"], "cmn-Hant": ["zh-Hant"], "cmn-MO": ["zh-Hant"], "cmn-TW": ["zh-Hant"],
  hak: ["zh-Hans"], "hak-Hant": ["zh-Hant"], "hak-TW": ["zh-Hant"], nan: ["zh-Hans"], "nan-Hant": ["zh-Hant"], "nan-TW": ["zh-Hant"],
  cdo: ["zh-Hans"], cjy: ["zh-Hans"], cpx: ["zh-Hans"], gan: ["zh-Hans"], hsn: ["zh-Hans"], wuu: ["zh-Hans"],
  ii: ["zh-Hans"], za: ["zh-Hans"], "bo-CN": ["zh-Hans"], "kk-CN": ["zh-Hans"], "mn-CN": ["zh-Hans"], "mn-Mong": ["zh-Hans"], "hmn-CN": ["zh-Hans"],
  ug: ["uz", "tr"], "ug-CN": ["zh-Hans"],
  ab: ["ru"], ady: ["ru"], alt: ["ru"], av: ["ru"], ba: ["ru"], be: ["ru"], bua: ["ru"], ce: ["ru"], cv: ["ru"], dar: ["ru"], inh: ["ru"], kbd: ["ru"], kjh: ["ru"], kk: ["ru"], koi: ["ru"], krc: ["ru"], krl: ["ru"], kum: ["ru"], kv: ["ru"], ky: ["ru"], lez: ["ru"], mdf: ["ru"], mhr: ["ru"], myv: ["ru"], nog: ["ru"], os: ["ru"], sah: ["ru"], tg: ["ru"], tt: ["ru"], tyv: ["ru"], udm: ["ru"], xal: ["ru"],
  rue: ["uk"], "crh-UA": ["uk", "tr"], csb: ["pl"], szl: ["pl"],
  az: ["tr"], "az-IR": ["fa"], azb: ["fa", "tr"], crh: ["tr"], "crh-RU": ["ru", "tr"], "crh-UZ": ["uz", "tr"], diq: ["tr"], gag: ["tr", "ru"], lzz: ["tr"], tk: ["tr", "ru"], "tk-AF": ["fa"], "tk-IR": ["fa"], zza: ["tr"], kaa: ["uz"],
  ku: ["tr", "ar", "fa"], "ku-IQ": ["ar"], "ku-IR": ["fa"], "ku-SY": ["ar"], "ku-TR": ["tr"], ckb: ["ar", "fa"], "ckb-IQ": ["ar"], "ckb-IR": ["fa"],
  bqi: ["fa"], glk: ["fa"], lrc: ["fa"], luz: ["fa"], mzn: ["fa"],
  kr: ["ha"], "ff-NE": ["ha"], "ff-NG": ["ha"],
  guz: ["sw"], kam: ["sw"], ki: ["sw"], luo: ["sw"], luy: ["sw"], mas: ["sw"], nym: ["sw"], suk: ["sw"],
};

const canonicalLanguage = (language: string): string => (Object.hasOwn(LANGUAGE_ALIASES, language) ? LANGUAGE_ALIASES[language] : language);

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

function relatedInterfaceLanguagesOf(candidate: string): readonly string[] {
  const { language, script, region } = parseLanguageTag(candidate);
  const base = canonicalLanguage(language);
  const key = [script && `${base}-${script}`, region && `${base}-${region}`, base].find((candidateKey) => candidateKey && Object.hasOwn(RELATED_INTERFACE_LANGUAGES, candidateKey));
  return key ? RELATED_INTERFACE_LANGUAGES[key] : [];
}

function resolveRelatedInterfaceLanguage(candidate: string, supported: readonly string[]): string | undefined {
  for (const related of relatedInterfaceLanguagesOf(candidate)) {
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
