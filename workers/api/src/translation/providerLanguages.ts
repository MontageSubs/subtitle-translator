export type ProviderId = "google-nmt-v2" | "google-nmt-pa" | "microsoft-nmt-edge" | "deepl";

interface ProviderCatalog {
  nativeByTag: ReadonlyMap<string, string>;
  nativeByBase: ReadonlyMap<string, string>;
  tagByNative: ReadonlyMap<string, string>;
}

const GOOGLE_LANGUAGES =
  "ab ace ach af sq alz am ar hy as awa ay az ban bm ba eu btx bts bbc be bem bn bew bho bik bs br bg " +
  "bua yue ca ceb ny zh-CN>zh-Hans|zh zh-TW>zh-Hant cv co crh hr cs da din dv doi dov nl dz en eo et ee " +
  "fj fil|tl fi fr fr-FR fr-CA fy ff gaa gl lg ka de el gn gu ht cnh ha haw iw>he|he hil hi hmn hu hrx " +
  "is ig ilo id ga it ja jw>jv|jv kn pam kk km cgg rw ktu gom ko kri ku ckb ky lo ltg la lv lij li ln " +
  "lt lmo luo lb mk mai mak mg ms ms-Arab ml mt mi mr chm mni-Mtei min lus mn my nr new ne nso no nus " +
  "oc or om pag pap ps fa pl pt pt-PT pt-BR pa pa-Arab qu rom ro rn ru sm sg sa gd sr st crs shn sn scn " +
  "szl sd si sk sl so es su sw ss sv tg ta tt te tet th ti ts tn tr tk ak uk ur ug uz vi cy xh yi yo " +
  "yua zu";

const MICROSOFT_LANGUAGES =
  "af sq am ar hy as az ba bn bho brx bs bg yue ca hne lzh zh-Hans zh-Hant sn hr cs da prs dv doi nl en " +
  "et fo fj fil fi fr fr-ca gl ka de el gu ht ha he hi mww>hmn hu is ig id ikt iu iu-Latn ga it ja kn " +
  "ks kk km rw tlh-Latn tlh-Piqd gom ko ku>ckb kmr>ku ky lo lv lt ln dsb lug>lg mk mai mg ms ml mt " +
  "mni>mni-Mtei mi mr mn-Cyrl>mn mn-Mong my ne nb>no nya>ny or ps fa pl pt>pt-BR pt-pt pa otq ro run>rn " +
  "ru sm sr-Cyrl>sr sr-Latn st nso tn sd si sk sl so es sw sv ty ta tt te th bo ti to tr tk uk hsb ur " +
  "ug uz vi cy xh yo yua zu";

const DEEPL_LANGUAGES =
  "ACE AF SQ AR AN HY AS AY AZ BA EU BE BN BHO BS BR BG MY YUE CA CEB ZH-HANS! ZH-HANT! ZH HR CS DA PRS " +
  "NL EN? EN-US! EN-GB! EO ET FI FR FR-CA! FR-FR! GL KA DE DE-DE! DE-CH! EL GN GU HT HA HE HI HU IS IG " +
  "ID GA IT JA JV PAM KK GOM KO KMR>ku CKB KY LA LV LN LT LMO LB MK MAI MG MS ML MT MI MR MN NE NB>no " +
  "OC OM PAG PS FA PL PT-BR! PT-PT! PT? PA QU RO RU SA SR ST SCN SK SL ES ES-ES! ES-419! SU SW SV " +
  "TL>fil TG TA TT TE TH TS TN TR TK UK UR UZ VI CY WO XH YI ZU";

const LEGACY_TAGS =
  "tl>fil lug>lg mww>hmn kmr>ku zh-cn>zh-Hans zh-sg>zh-Hans zh-tw>zh-Hant zh-hk>zh-Hant zh-mo>zh-Hant " +
  "nb>no nn>no iw>he jw>jv nya>ny run>rn mni>mni-Mtei sr-cyrl>sr mn-cyrl>mn in>id";

const SOURCES: Readonly<Record<ProviderId, string>> = {
  "google-nmt-v2": GOOGLE_LANGUAGES,
  "google-nmt-pa": GOOGLE_LANGUAGES,
  "microsoft-nmt-edge": MICROSOFT_LANGUAGES,
  deepl: DEEPL_LANGUAGES,
};

const legacyTags: ReadonlyMap<string, string> = new Map(LEGACY_TAGS.split(" ").map((pair) => pair.split(">") as [string, string]));

const normalize = (code: string): string => code.trim().toLowerCase().replace(/_/g, "-");

const baseOf = (tag: string): string => tag.split("-")[0];

function tagCase(code: string): string {
  const [language, ...subtags] = code.split("-");
  const cased = subtags.map((subtag) => (/^[a-z]{4}$/i.test(subtag) ? subtag[0].toUpperCase() + subtag.slice(1).toLowerCase() : subtag.toUpperCase()));
  return [language.toLowerCase(), ...cased].join("-");
}

function buildCatalog(raw: string): ProviderCatalog {
  const nativeByTag = new Map<string, string>();
  const nativeByBase = new Map<string, string>();
  const tagByNative = new Map<string, string>();
  for (const entry of raw.split(" ")) {
    const [head, ...aliases] = entry.replace(/[!?]$/, "").split("|");
    const [code, tag = tagCase(code)] = head.split(">");
    const key = normalize(tag);
    const base = baseOf(key);
    nativeByTag.set(key, code);
    if (!nativeByBase.has(base) || key === base) nativeByBase.set(base, code);
    for (const native of [code, ...aliases]) tagByNative.set(normalize(native), tag);
  }
  return { nativeByTag, nativeByBase, tagByNative };
}

const catalogs = new Map<string, ProviderCatalog>();

function catalogOf(provider: string): ProviderCatalog | undefined {
  let catalog = catalogs.get(provider);
  const raw = SOURCES[provider as ProviderId];
  if (!catalog && raw) {
    catalog = buildCatalog(raw);
    catalogs.set(provider, catalog);
  }
  return catalog;
}

export function languageTag(provider: string, native: string): string {
  return catalogOf(provider)?.tagByNative.get(normalize(native)) ?? native;
}

export function resolveProviderLanguage(provider: string, tag: string): string | null {
  const catalog = catalogOf(provider);
  if (!catalog) return null;
  const key = normalize(tag);
  const canonical = legacyTags.get(key) ?? key;
  const exact = catalog.nativeByTag.get(canonical);
  return exact ?? catalog.nativeByBase.get(baseOf(canonical)) ?? null;
}
