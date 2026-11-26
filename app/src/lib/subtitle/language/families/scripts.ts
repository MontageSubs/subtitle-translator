import { createLineBreakPolicy } from "../shared/breakScoring";
import { UNIVERSAL_ORTHOGRAPHY } from "../shared/orthography";
import { createSourceRules } from "../shared/sourceRules";
import { LanguageModule, OrthographyRule, Script } from "../shared/types";
import { ARABIC_SCRIPT_NO_LINE_START, defineArabicScriptLanguage } from "./arabic";
import { defineCyrillicLanguage } from "./cyrillic";
import { defineLatinLanguage } from "./latin";

type GenericScript = Exclude<Script, "cjk">;

export function defineGenericLanguage(script: GenericScript, code: string, rule: OrthographyRule = UNIVERSAL_ORTHOGRAPHY): LanguageModule {
  return {
    id: code,
    script,
    source: createSourceRules(),
    target: {
      lineBreak: createLineBreakPolicy(rule, { countsCharacters: false, rewardsSpaceBoundary: false }),
      alignsMusicToTop: false,
    },
  };
}

const ARABIC_SCRIPT_ORTHOGRAPHY: OrthographyRule = {
  ...UNIVERSAL_ORTHOGRAPHY,
  noLineStart: new Set([...UNIVERSAL_ORTHOGRAPHY.noLineStart, ...ARABIC_SCRIPT_NO_LINE_START]),
};

export function defineListedLanguage(code: string, script: Script | undefined): LanguageModule | undefined {
  if (script === "latin") return defineLatinLanguage(code, UNIVERSAL_ORTHOGRAPHY);
  if (script === "cyrillic") return defineCyrillicLanguage(code, UNIVERSAL_ORTHOGRAPHY);
  if (script === "arabic") return defineArabicScriptLanguage(code, ARABIC_SCRIPT_ORTHOGRAPHY);
  return script && script !== "cjk" ? defineGenericLanguage(script, code) : undefined;
}

export function defineUnlistedLanguage(code: string): LanguageModule {
  return defineGenericLanguage("latin", code);
}
