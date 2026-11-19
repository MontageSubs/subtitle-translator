const MAX_LANGUAGES = 8;
const HEX_PATTERN = /^[0-9a-f]{8}$/;
const TAG_PATTERN = /^[a-z0-9]{1,8}(?:-[a-z0-9]{1,8}){0,4}$/;

export interface Hello {
  ts: number;
  lang: string[];
  hash: string;
  mac: string;
}

const normalizeTag = (tag: string): string => tag.trim().toLowerCase().replace(/_/g, "-");

const isLanguageList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_LANGUAGES && value.every((tag) => typeof tag === "string" && TAG_PATTERN.test(tag));

export const observedLanguages = (header: string): string[] =>
  header
    .split(",")
    .map((part) => normalizeTag(part.split(";", 1)[0]!))
    .filter((tag) => TAG_PATTERN.test(tag))
    .slice(0, MAX_LANGUAGES);

export function parseHello(raw: unknown): Hello | null {
  const { ts, lang, hash, mac } = (raw ?? {}) as { ts?: unknown; lang?: unknown; hash?: unknown; mac?: unknown };
  if (!Number.isSafeInteger(ts) || !isLanguageList(lang)) return null;
  if (typeof hash !== "string" || !HEX_PATTERN.test(hash) || typeof mac !== "string" || !HEX_PATTERN.test(mac)) return null;
  return { ts: ts as number, lang, hash, mac };
}
