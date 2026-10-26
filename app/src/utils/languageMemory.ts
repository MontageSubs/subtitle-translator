import { STORAGE_KEYS } from "../config/storage";
import { persistentStorage } from "./safeStorage";
import { SELECTABLE_LANGUAGE_CODES } from "./languageProfiles";


const LANGUAGE_MEMORY_SLOTS = 3;

const isSelectable = (code: unknown): code is string => typeof code === "string" && SELECTABLE_LANGUAGE_CODES.includes(code);

export function readLanguageMemory(): string[] {
  const stored = persistentStorage.readJson<unknown>(STORAGE_KEYS.recentTargetLanguages);
  return Array.isArray(stored) ? [...new Set(stored.filter(isSelectable))].slice(0, LANGUAGE_MEMORY_SLOTS) : [];
}

export function rememberLanguage(code: string): void {
  persistentStorage.writeJson(STORAGE_KEYS.recentTargetLanguages, [code, ...readLanguageMemory().filter((entry) => entry !== code)].slice(0, LANGUAGE_MEMORY_SLOTS));
}

export function forgetLanguage(code: string): void {
  persistentStorage.writeJson(STORAGE_KEYS.recentTargetLanguages, readLanguageMemory().filter((entry) => entry !== code));
}
