import { persistentStorage } from "./safeStorage";
import { SELECTABLE_LANGUAGE_CODES } from "./languageProfiles";

const STORAGE_KEY = "subtitle-translator:recent-target-languages";

const LANGUAGE_MEMORY_SLOTS = 3;

const isSelectable = (code: unknown): code is string => typeof code === "string" && SELECTABLE_LANGUAGE_CODES.includes(code);

export function readLanguageMemory(): string[] {
  const stored = persistentStorage.readJson<unknown>(STORAGE_KEY);
  return Array.isArray(stored) ? [...new Set(stored.filter(isSelectable))].slice(0, LANGUAGE_MEMORY_SLOTS) : [];
}

export function rememberLanguage(code: string): void {
  persistentStorage.writeJson(STORAGE_KEY, [code, ...readLanguageMemory().filter((entry) => entry !== code)].slice(0, LANGUAGE_MEMORY_SLOTS));
}

export function forgetLanguage(code: string): void {
  persistentStorage.writeJson(STORAGE_KEY, readLanguageMemory().filter((entry) => entry !== code));
}
