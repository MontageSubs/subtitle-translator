import { languageKey, scriptOf, type Script } from "../common/languageCodes";
import { defineListedLanguage, defineUnlistedLanguage } from "./families/scripts";
import { LANGUAGE_MODULES } from "./modules";
import { LanguageModule, SourceRules, TargetRules } from "./shared/types";

export type { LanguageModule, SourceRules, TargetRules } from "./shared/types";
export type { Script };
export { scriptOf };

const DEFAULT_LANGUAGE = "en";

const EXPLICIT_MODULES: ReadonlyMap<string, LanguageModule> = new Map(LANGUAGE_MODULES.map((module) => [module.id, module]));
const resolved = new Map(EXPLICIT_MODULES);

export function resolveLanguage(code: string | undefined | null): LanguageModule {
  const key = languageKey(code) || DEFAULT_LANGUAGE;
  let module = resolved.get(key);
  if (!module) {
    module = defineListedLanguage(key) ?? defineUnlistedLanguage(key);
    resolved.set(key, module);
  }
  return module;
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
