function normalizeTag(tag: string): string {
  return tag.trim().replace(/_/g, "-");
}

function getSubtags(tag: string): { language: string; script?: string; region?: string } {
  const parts = tag.split("-");
  const language = parts[0].toLowerCase();
  let script: string | undefined;
  let region: string | undefined;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.length === 4 && !script) {
      script = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    } else if ((part.length === 2 || part.length === 3) && !region) {
      region = part.toUpperCase();
    }
  }

  return { language, script, region };
}

export function resolveLanguageAssociation(candidate: string, supported: readonly string[]): string | undefined {
  const normalized = normalizeTag(candidate);
  if (!normalized) return undefined;

  const exact = supported.find((item) => item.toLowerCase() === normalized.toLowerCase());
  if (exact) return exact;

  const { language, script, region } = getSubtags(normalized);

  if (language === "zh") {
    const isTraditional = script === "Hant" || region === "TW" || region === "HK" || region === "MO" || /cht|traditional/i.test(normalized);
    const preferredChinese = isTraditional ? "zh-Hant" : "zh-Hans";
    const foundChinese = supported.find((item) => item.toLowerCase() === preferredChinese.toLowerCase());
    if (foundChinese) return foundChinese;
  }

  if (script) {
    const scriptMatch = supported.find((item) => {
      const itemSubtags = getSubtags(item);
      return itemSubtags.language === language && itemSubtags.script === script;
    });
    if (scriptMatch) return scriptMatch;
  }

  const baseMatch = supported.find((item) => {
    const itemSubtags = getSubtags(item);
    return itemSubtags.language === language && !itemSubtags.script;
  });
  if (baseMatch) return baseMatch;

  const prefixMatch = supported.find((item) => normalized.toLowerCase().startsWith(`${item.toLowerCase()}-`));
  if (prefixMatch) return prefixMatch;

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
