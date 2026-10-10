import { scriptOf } from "../../common/languageCodes";
import { createLineBreakPolicy } from "../shared/breakScoring";
import { UNIVERSAL_ORTHOGRAPHY } from "../shared/orthography";
import { createSourceRules } from "../shared/sourceRules";
import { LanguageModule, Script } from "../shared/types";
import { defineCyrillicLanguage } from "./cyrillic";
import { defineLatinLanguage } from "./latin";

type GenericScript = Exclude<Script, "cjk">;

function defineGenericLanguage(script: GenericScript, code: string): LanguageModule {
  return {
    id: code,
    script,
    source: createSourceRules(),
    target: {
      lineBreak: createLineBreakPolicy(UNIVERSAL_ORTHOGRAPHY, { countsCharacters: false, rewardsSpaceBoundary: false }),
      assFont: "Arial",
      alignsMusicToTop: false,
    },
  };
}

export function defineListedLanguage(code: string): LanguageModule | undefined {
  const script = scriptOf(code);
  if (script === "latin") return defineLatinLanguage(code, UNIVERSAL_ORTHOGRAPHY);
  if (script === "cyrillic") return defineCyrillicLanguage(code, UNIVERSAL_ORTHOGRAPHY);
  return script && script !== "cjk" ? defineGenericLanguage(script, code) : undefined;
}

export function defineUnlistedLanguage(code: string): LanguageModule {
  return defineGenericLanguage("latin", code);
}
