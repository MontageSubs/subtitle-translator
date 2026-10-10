import { languageKey } from "../../../subtitle/common/languageCodes";

export type DeeplRole = "source" | "target" | "glossary";

const BRITISH_ENGLISH = "en-gb";
const EUROPEAN_PORTUGUESE = "pt-pt";

function targetVariant(key: string, region: string): string {
  if (key === "en") return region === BRITISH_ENGLISH ? "EN-GB" : "EN-US";
  return region === EUROPEAN_PORTUGUESE ? "PT-PT" : "PT-BR";
}

export function toDeeplLang(code: string, role: DeeplRole): string {
  if (!code || code === "auto") return "";
  const key = languageKey(code);
  if (key.startsWith("zh-")) return role === "target" ? key.toUpperCase() : "ZH";
  if (key === "no") return "NB";
  if (role === "target" && (key === "en" || key === "pt")) return targetVariant(key, code.trim().toLowerCase().replace(/_/g, "-"));
  return key.toUpperCase();
}
