export interface ParsedLanguageTag {
  language: string;
  script?: string;
  region?: string;
}

export function parseLanguageTag(tag: string): ParsedLanguageTag {
  const clean = tag.trim().split(";")[0].replace(/_/g, "-");
  const parts = clean.split("-");
  const language = parts[0]?.toLowerCase() ?? "";
  let script: string | undefined;
  let region: string | undefined;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.length === 4 && !script) {
      script = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    } else if ((part.length === 2 || /^\d{3}$/.test(part)) && !region) {
      region = part.toUpperCase();
    }
  }

  return { language, script, region };
}

const CROSS_VARIANTS: Record<string, readonly string[]> = {
  "zh-hans": ["zh-Hant", "zh"],
  "zh-hant": ["zh-Hans", "zh"],
  "pt-br": ["pt-PT", "pt"],
  "pt-pt": ["pt-BR", "pt"],
  "es-419": ["es-ES", "es"],
  "es-es": ["es-419", "es"],
  "sr-cyrl": ["sr-Latn", "sr", "bs", "hr"],
  "sr-latn": ["sr-Cyrl", "sr", "hr", "bs"],
  nb: ["no", "nn"],
  nn: ["no", "nb"],
  no: ["nb", "nn"],
};

export function resolveLanguageAssociation(candidate: string, supported: readonly string[]): string | undefined {
  const trimmed = candidate.trim().split(";")[0];
  if (!trimmed) return undefined;

  const exact = supported.find((item) => item.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  const { language, script, region } = parseLanguageTag(trimmed);
  if (!language) return undefined;

  if (language === "zh") {
    const isTraditional = script === "Hant" || region === "TW" || region === "HK" || region === "MO" || /cht|traditional/i.test(trimmed);
    const primaryChoice = isTraditional ? "zh-Hant" : "zh-Hans";
    const secondaryChoice = isTraditional ? "zh-Hans" : "zh-Hant";
    const match = supported.find((item) => item.toLowerCase() === primaryChoice.toLowerCase())
      ?? supported.find((item) => item.toLowerCase() === secondaryChoice.toLowerCase())
      ?? supported.find((item) => parseLanguageTag(item).language === "zh");
    if (match) return match;
  }

  const crossList = CROSS_VARIANTS[trimmed.toLowerCase()];
  if (crossList) {
    for (const alt of crossList) {
      const match = supported.find((item) => item.toLowerCase() === alt.toLowerCase());
      if (match) return match;
    }
  }

  if (script) {
    const scriptMatch = supported.find((item) => {
      const itemTag = parseLanguageTag(item);
      return itemTag.language === language && itemTag.script === script;
    });
    if (scriptMatch) return scriptMatch;
  }

  const prefixMatch = supported.find((item) => {
    const normItem = item.toLowerCase();
    const normCand = trimmed.toLowerCase();
    return normCand.startsWith(`${normItem}-`) || normItem.startsWith(`${normCand}-`);
  });
  if (prefixMatch) return prefixMatch;

  const familyMatch = supported.find((item) => parseLanguageTag(item).language === language);
  if (familyMatch) return familyMatch;

  return undefined;
}

export function matchPreferredLocale(preferences: readonly string[], supported: readonly string[], defaultLocale: string): string {
  for (const candidate of preferences) {
    if (!candidate) continue;
    const resolved = resolveLanguageAssociation(candidate, supported);
    if (resolved) return resolved;
  }
  return defaultLocale;
}
