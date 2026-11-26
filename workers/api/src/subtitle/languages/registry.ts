import { latinFamily, classicalLatinFamily } from "./modules/latin";
import { nonLatinSourceRules } from "./rules";
import { chineseFamily, cantoneseFamily } from "./modules/chinese";
import { japaneseFamily } from "./modules/japanese";
import { koreanFamily } from "./modules/korean";
import { cyrillicFamily } from "./modules/cyrillic";
import { arabicFamily } from "./modules/arabic";
import { devanagariFamily } from "./modules/devanagari";
import { thaiFamily } from "./modules/thai";
import { hebrewFamily } from "./modules/hebrew";
import { greekFamily } from "./modules/greek";
import { baseLanguage, scriptOf } from "../common/languageCodes";
import type { LanguageFamily, LanguageModule, SourceRules, TargetRules } from "./types";

const FAMILIES: readonly LanguageFamily[] = [
  latinFamily, classicalLatinFamily, chineseFamily, cantoneseFamily, japaneseFamily, koreanFamily,
  cyrillicFamily, arabicFamily, devanagariFamily, thaiFamily, hebrewFamily, greekFamily,
];

const MODULES = new Map<string, LanguageModule>(
  FAMILIES.flatMap((family) => family.codes.map((code) => [code, family.module] as const))
);

const MODULE_BY_SCRIPT = new Map<string, LanguageModule>(FAMILIES.map((family) => [family.module.script, family.module] as const).reverse());

function languageModuleOf(code: string | null | undefined): LanguageModule | undefined {
  const home = MODULES.get(baseLanguage(code));
  const script = scriptOf(code);
  if (script === undefined || home?.script === script) return home;
  return MODULE_BY_SCRIPT.get(script) ?? home;
}

export const sourceRulesFor = (code: string | null | undefined): SourceRules => languageModuleOf(code)?.source ?? nonLatinSourceRules;

export const targetRulesFor = (code: string | null | undefined): TargetRules => (languageModuleOf(code) ?? latinFamily.module).targetFor(code || "");
