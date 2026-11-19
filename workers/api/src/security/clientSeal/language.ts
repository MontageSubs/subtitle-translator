export const MAX_LANGUAGES = 8;

const TAG_PATTERN = /^[a-z0-9]{1,8}(?:-[a-z0-9]{1,8}){0,4}$/;

const normalizeTag = (tag: string): string => tag.trim().toLowerCase().replace(/_/g, "-");

export const isLanguageList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_LANGUAGES && value.every((tag) => typeof tag === "string" && TAG_PATTERN.test(tag));

export const observedLanguages = (header: string): string[] =>
  header
    .split(",")
    .map((part) => normalizeTag(part.split(";", 1)[0]!))
    .filter((tag) => TAG_PATTERN.test(tag))
    .slice(0, MAX_LANGUAGES);
