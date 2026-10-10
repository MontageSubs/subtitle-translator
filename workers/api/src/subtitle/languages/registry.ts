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
import { baseLanguage } from "../common/languageCodes";
import type { LanguageFamily, LanguageModule, SourceRules, TargetRules } from "./types";

const FAMILIES: readonly LanguageFamily[] = [
  latinFamily, classicalLatinFamily, chineseFamily, cantoneseFamily, japaneseFamily, koreanFamily,
  cyrillicFamily, arabicFamily, devanagariFamily, thaiFamily, hebrewFamily, greekFamily,
];

const MODULES = new Map<string, LanguageModule>(
  FAMILIES.flatMap((family) => family.codes.map((code) => [code, family.module] as const))
);

const moduleFor = (code: string | null | undefined): LanguageModule => MODULES.get(baseLanguage(code)) ?? latinFamily.module;

export const sourceRulesFor = (code: string | null | undefined): SourceRules => MODULES.get(baseLanguage(code))?.source ?? nonLatinSourceRules;

export const targetRulesFor = (code: string | null | undefined): TargetRules => moduleFor(code).targetFor(code || "");
