export interface ParsedLanguageTag {
  language: string;
  script?: string;
  region?: string;
}

export const LEGACY_SCRIPTS: Readonly<Record<string, string>> = { cht: "Hant", chs: "Hans" };
export const TRADITIONAL_REGIONS: readonly string[] = ["TW", "HK", "MO"];
export const LANGUAGE_ALIASES: Readonly<Record<string, string>> = { nb: "no", nn: "no", in: "id", iw: "he", ji: "yi", tl: "fil" };

export function normalizeTag(tag: string): string {
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

const canonicalLanguage = (language: string): string => LANGUAGE_ALIASES[language] ?? language;

function resolveLanguageAssociation(candidate: string, supported: readonly string[]): string | undefined {
  const normalized = normalizeTag(candidate).toLowerCase();
  const exact = supported.find((code) => code.toLowerCase() === normalized);
  if (exact) return exact;
  const wanted = parseLanguageTag(normalized);
  if (!wanted.language) return undefined;
  const script = inferScript(wanted);
  const family = supported.filter((code) => canonicalLanguage(parseLanguageTag(code).language) === canonicalLanguage(wanted.language));
  return (
    family.find((code) => script && inferScript(parseLanguageTag(code)) === script) ??
    family.find((code) => wanted.region && parseLanguageTag(code).region === wanted.region) ??
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
