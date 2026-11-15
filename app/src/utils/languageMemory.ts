import { STORAGE_KEYS } from "../config/storage";
import { persistentStorage } from "./safeStorage";
import { SELECTABLE_LANGUAGE_CODES } from "./languageProfiles";

const LANGUAGE_MEMORY_SLOTS = 3;

const isSelectable = (code: unknown): code is string => typeof code === "string" && SELECTABLE_LANGUAGE_CODES.includes(code);

export interface LanguageMemory {
  read(): string[];
  remember(code: string): void;
  forget(code: string): void;
}

function createLanguageMemory(storageKey: string): LanguageMemory {
  const read = (): string[] => {
    const stored = persistentStorage.readJson<unknown>(storageKey);
    return Array.isArray(stored) ? [...new Set(stored.filter(isSelectable))].slice(0, LANGUAGE_MEMORY_SLOTS) : [];
  };
  return {
    read,
    remember: (code) => isSelectable(code) && persistentStorage.writeJson(storageKey, [code, ...read().filter((entry) => entry !== code)].slice(0, LANGUAGE_MEMORY_SLOTS)),
    forget: (code) => persistentStorage.writeJson(storageKey, read().filter((entry) => entry !== code)),
  };
}

export const targetLanguageMemory = createLanguageMemory(STORAGE_KEYS.recentTargetLanguages);

export const sourceLanguageMemory = createLanguageMemory(STORAGE_KEYS.recentSourceLanguages);
