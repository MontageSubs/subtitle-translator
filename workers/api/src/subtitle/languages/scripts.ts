import type { Script } from "./types";

const WORD_BASED_SCRIPTS: ReadonlySet<Script> = new Set<Script>(["latin", "cyrillic", "arabic", "devanagari", "hebrew", "greek"]);

const SCRIPT_CHAR_RANGES: Record<Script, string> = {
  latin: "A-Za-z",
  cyrillic: "\u0400-\u04ff",
  arabic: "\u0600-\u06ff",
  devanagari: "\u0900-\u097f",
  hebrew: "\u0590-\u05ff",
  greek: "\u0370-\u03ff",
  cjk: "\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af",
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
