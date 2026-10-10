import type { Script } from "./types";

const WORD_BASED_SCRIPTS: ReadonlySet<Script> = new Set<Script>(["latin", "cyrillic", "arabic", "devanagari", "hebrew", "greek"]);

const SCRIPT_CHAR_RANGES: Record<Script, string> = {
  latin: "A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f\u1e00-\u1eff",
  cyrillic: "\u0400-\u052f",
  arabic: "\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff",
  devanagari: "\u0900-\u097f",
  hebrew: "\u0590-\u05ff\ufb1d-\ufb4f",
  greek: "\u0370-\u03ff\u1f00-\u1fff",
  cjk: "\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\u31f0-\u31ff\u1100-\u11ff\u3130-\u318f\uac00-\ud7af",
  thai: "\u0e00-\u0e7f",
};

const LEAK_PATTERNS = Object.fromEntries(
  (Object.keys(SCRIPT_CHAR_RANGES) as Script[]).map((script) => [
    script,
    new RegExp(WORD_BASED_SCRIPTS.has(script) ? `[${SCRIPT_CHAR_RANGES[script]}]{2,}` : `[${SCRIPT_CHAR_RANGES[script]}]`, "g"),
  ])
) as Record<Script, RegExp>;

const PRESENCE_PATTERNS = Object.fromEntries(
  (Object.keys(SCRIPT_CHAR_RANGES) as Script[]).map((script) => [script, new RegExp(`[${SCRIPT_CHAR_RANGES[script]}]`)])
) as Record<Script, RegExp>;

export const containsScript = (script: Script, text: string): boolean => PRESENCE_PATTERNS[script].test(text);

export const isWordBasedScript = (script: Script): boolean => WORD_BASED_SCRIPTS.has(script);

export const scriptLeakPattern = (script: Script): RegExp => LEAK_PATTERNS[script];
