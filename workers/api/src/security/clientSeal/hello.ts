const MAX_LANGUAGES = 8;
const HEX_PATTERN = /^[0-9a-f]{8}$/;
const TAG_PATTERN = /^[a-z0-9]{1,8}(?:-[a-z0-9]{1,8}){0,4}$/;
const TIMEZONE_PATTERN = /^[A-Za-z0-9_+-]{1,32}(?:\/[A-Za-z0-9_+-]{1,32}){0,2}$/;
const MAX_TIMEZONE_CHARS = 40;

export interface Hello {
  ts: number;
  lang: string[];
  hash: string | null;
  mac: string;
  tz: string | null;
  ui: string | null;
}

const normalizeTag = (tag: string): string => tag.trim().toLowerCase().replace(/_/g, "-");

const isLanguageList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_LANGUAGES && value.every((tag) => typeof tag === "string" && TAG_PATTERN.test(tag));

const isTimezone = (value: unknown): boolean => typeof value === "string" && value.length <= MAX_TIMEZONE_CHARS && TIMEZONE_PATTERN.test(value);

const isLanguageTag = (value: unknown): boolean => typeof value === "string" && TAG_PATTERN.test(value);

function optionalField(value: unknown, accepts: (candidate: unknown) => boolean): string | null | undefined {
  if (value === undefined || value === null) return null;
  return accepts(value) ? (value as string) : undefined;
}

export const observedLanguages = (header: string): string[] =>
  header
    .split(",")
    .map((part) => normalizeTag(part.split(";", 1)[0]!))
    .filter((tag) => TAG_PATTERN.test(tag))
    .slice(0, MAX_LANGUAGES);

export function parseHello(raw: unknown, carriesHash: boolean): Hello | null {
  const { ts, lang, hash, mac, tz, ui } = (raw ?? {}) as { ts?: unknown; lang?: unknown; hash?: unknown; mac?: unknown; tz?: unknown; ui?: unknown };
  if (!Number.isSafeInteger(ts) || !isLanguageList(lang)) return null;
  if (typeof mac !== "string" || !HEX_PATTERN.test(mac)) return null;
  if (carriesHash && (typeof hash !== "string" || !HEX_PATTERN.test(hash))) return null;
  const timezone = optionalField(tz, isTimezone);
  const uiLanguage = optionalField(ui, isLanguageTag);
  if (timezone === undefined || uiLanguage === undefined) return null;
  return { ts: ts as number, lang, hash: carriesHash ? (hash as string) : null, mac, tz: timezone, ui: uiLanguage };
}
