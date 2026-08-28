const TARGET_OVERRIDES: Record<string, string> = {
  en: "EN-US",
  "en-us": "EN-US",
  "en-gb": "EN-GB",
  pt: "PT-BR",
  "pt-br": "PT-BR",
  "pt-pt": "PT-PT",
  zh: "ZH-HANS",
  "zh-hans": "ZH-HANS",
  "zh-cn": "ZH-HANS",
  "zh-sg": "ZH-HANS",
  "zh-hant": "ZH-HANT",
  "zh-tw": "ZH-HANT",
  "zh-hk": "ZH-HANT",
  "zh-mo": "ZH-HANT",
  no: "NB",
  nb: "NB",
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
  "zh-cn": "ZH",
  "zh-tw": "ZH",
  "zh-hk": "ZH",
  "zh-sg": "ZH",
  "zh-mo": "ZH",
  no: "NB",
  nb: "NB",
};

const GLOSSARY_OVERRIDES: Record<string, string> = {
  en: "EN",
  "en-us": "EN",
  "en-gb": "EN",
  pt: "PT",
  "pt-br": "PT",
  "pt-pt": "PT",
  zh: "ZH",
  "zh-hans": "ZH",
  "zh-hant": "ZH",
  "zh-cn": "ZH",
  "zh-tw": "ZH",
  "zh-hk": "ZH",
  "zh-sg": "ZH",
  "zh-mo": "ZH",
  no: "NB",
  nb: "NB",
};

export function toDeeplLang(code: string, role: "source" | "target" | "glossary"): string {
  if (!code || code === "auto") {
    return "";
  }
  const key = code.toLowerCase();
  const table = role === "target" ? TARGET_OVERRIDES : role === "glossary" ? GLOSSARY_OVERRIDES : SOURCE_OVERRIDES;
  return table[key] || key.split("-")[0].toUpperCase();
}
