import { defineListedLanguage, defineUnlistedLanguage, listedScriptOf } from "./families/scripts";
import { LANGUAGE_MODULES } from "./modules";
import { LanguageModule, Script, SourceRules, TargetRules } from "./shared/types";

export type { LanguageModule, Script, SourceRules, TargetRules } from "./shared/types";

const DEFAULT_LANGUAGE = "en";
const TRADITIONAL_PATTERN = /hant|[-_](?:tw|hk|mo)(?![a-z])/;

const EXPLICIT_MODULES: ReadonlyMap<string, LanguageModule> = new Map(LANGUAGE_MODULES.map((module) => [module.id, module]));
const resolved = new Map(EXPLICIT_MODULES);

function languageKey(code: string | undefined | null): string {
  const normalized = (code || DEFAULT_LANGUAGE).toLowerCase().trim();
  if (normalized.startsWith("zh")) return TRADITIONAL_PATTERN.test(normalized) ? "zh-hant" : "zh-hans";
  if (normalized.startsWith("yue") || normalized === "cantonese") return "yue";
  return normalized.split("-")[0];
}

export function resolveLanguage(code: string | undefined | null): LanguageModule {
  const key = languageKey(code);
  let module = resolved.get(key);
  if (!module) {
    module = defineListedLanguage(key) ?? defineUnlistedLanguage(key);
    resolved.set(key, module);
  }
  return module;
}

export function scriptOf(code: string | undefined | null): Script | undefined {
  if (!code) return undefined;
  const key = languageKey(code);
  return EXPLICIT_MODULES.get(key)?.script ?? listedScriptOf(key);
}

export function sourceRulesFor(code: string | undefined | null): SourceRules {
  return resolveLanguage(code).source;
}

export function targetRulesFor(code: string | undefined | null): TargetRules {
  return resolveLanguage(code).target;
}

export function isCjkLanguage(code: string | undefined | null): boolean {
  return scriptOf(code) === "cjk";
}
