import { languageKey } from "../../../subtitle/common/languageCodes";

export function normalizeMicrosoftLang(code: string | undefined): string {
  if (!code || code.toLowerCase() === "auto") return "";
  const key = languageKey(code);
  return key === "zh-hans" ? "zh-Hans" : key === "zh-hant" ? "zh-Hant" : code;
}
