const TARGET_OVERRIDES: Record<string, string> = {
  en: "EN-US",
  "en-us": "EN-US",
  "en-gb": "EN-GB",
  pt: "PT-BR",
  "pt-br": "PT-BR",
  "pt-pt": "PT-PT",
  zh: "ZH",
  "zh-hans": "ZH-HANS",
  "zh-hant": "ZH-HANT",
};

const SOURCE_OVERRIDES: Record<string, string> = {
  en: "EN",
  "en-us": "EN",
  "en-gb": "EN",
  pt: "PT",
  "pt-br": "PT",
  "pt-pt": "PT",
  zh: "ZH",
  "zh-hans": "ZH",
  "zh-hant": "ZH",
};

export function toDeeplLang(code: string, role: "source" | "target"): string {
  if (!code || code === "auto") {
    return "";
  }
  const key = code.toLowerCase();
  const table = role === "target" ? TARGET_OVERRIDES : SOURCE_OVERRIDES;
  return table[key] || key.split("-")[0].toUpperCase();
}
