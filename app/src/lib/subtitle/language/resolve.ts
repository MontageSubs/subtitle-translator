import { LATIN_SCRIPT_CODES, defineLatinLanguage } from "./families/latin";
import { defineUnlistedLanguage } from "./families/other";
import { LANGUAGE_MODULES } from "./modules";
import { UNIVERSAL_ORTHOGRAPHY } from "./shared/orthography";
import { LanguageModule } from "./shared/types";

export type { LanguageModule, ScriptFamily } from "./shared/types";

const DEFAULT_LANGUAGE = "en";
const TRADITIONAL_PATTERN = /hant|[-_](?:tw|hk|mo)(?![a-z])/;

const registry = new Map<string, LanguageModule>(LANGUAGE_MODULES.map((module) => [module.id, module]));

function languageKey(code: string | undefined | null): string {
  const normalized = (code || DEFAULT_LANGUAGE).toLowerCase().trim();
  if (normalized.startsWith("zh")) return TRADITIONAL_PATTERN.test(normalized) ? "zh-hant" : "zh-hans";
  if (normalized.startsWith("yue") || normalized === "cantonese") return "yue";
  return normalized.split("-")[0];
}

export function isCjkLanguage(code: string | undefined | null): boolean {
  return Boolean(code) && resolveLanguage(code).script === "cjk";
}

export function resolveLanguage(code: string | undefined | null): LanguageModule {
  const key = languageKey(code);
  let module = registry.get(key);
  if (!module) {
    module = LATIN_SCRIPT_CODES.has(key) ? defineLatinLanguage(key, UNIVERSAL_ORTHOGRAPHY) : defineUnlistedLanguage(key);
    registry.set(key, module);
  }
  return module;
}
