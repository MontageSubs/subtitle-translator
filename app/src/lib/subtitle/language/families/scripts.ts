import { createLineBreakPolicy } from "../shared/breakScoring";
import { UNIVERSAL_ORTHOGRAPHY } from "../shared/orthography";
import { createSourceRules } from "../shared/sourceRules";
import { LanguageModule, Script } from "../shared/types";
import { defineCyrillicLanguage } from "./cyrillic";
import { LATIN_SCRIPT_CODES, defineLatinLanguage } from "./latin";

type GenericScript = Exclude<Script, "cjk">;

const SCRIPT_CODES: Record<GenericScript, ReadonlySet<string>> = {
  latin: LATIN_SCRIPT_CODES,
  cyrillic: new Set(["ru", "uk", "bg"]),
  arabic: new Set(["ar", "fa", "ur"]),
  devanagari: new Set(["hi", "ne", "mr"]),
  hebrew: new Set(["he"]),
  greek: new Set(["el"]),
  thai: new Set(["th"]),
};

const SCRIPT_BY_CODE: ReadonlyMap<string, GenericScript> = new Map(
  (Object.entries(SCRIPT_CODES) as [GenericScript, ReadonlySet<string>][]).flatMap(([script, codes]) => [...codes].map((code): [string, GenericScript] => [code, script]))
);

function defineGenericLanguage(script: GenericScript, code: string): LanguageModule {
  return {
    id: code,
    script,
    source: createSourceRules(),
    target: {
      reading: { maxCharsPerLine: 42, speedCps: 17 },
      lineBreak: createLineBreakPolicy(UNIVERSAL_ORTHOGRAPHY, { countsCharacters: false, rewardsSpaceBoundary: false }),
      assFont: "Arial",
      alignsMusicToTop: false,
    },
  };
}

export function listedScriptOf(code: string): Script | undefined {
  return SCRIPT_BY_CODE.get(code);
}

export function defineListedLanguage(code: string): LanguageModule | undefined {
  const script = SCRIPT_BY_CODE.get(code);
  if (script === "latin") return defineLatinLanguage(code, UNIVERSAL_ORTHOGRAPHY);
  if (script === "cyrillic") return defineCyrillicLanguage(code, UNIVERSAL_ORTHOGRAPHY);
  return script && defineGenericLanguage(script, code);
}

export function defineUnlistedLanguage(code: string): LanguageModule {
  return defineGenericLanguage("latin", code);
}
