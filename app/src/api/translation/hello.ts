import { BUILD_SEAL } from "../../config/compat";
import { getLocale } from "../../i18n";
import { browserLanguageTags } from "../../i18n/browserLanguages";

const HASH_CHARS = 8;
const MAC_CHARS = 8;
const MAX_LANGUAGES = 8;
const LANGUAGE_TAG_PATTERN = /^[a-z0-9]{1,8}(?:-[a-z0-9]{1,8}){0,4}$/;
const TIMEZONE_PATTERN = /^[A-Za-z0-9_+-]{1,32}(?:\/[A-Za-z0-9_+-]{1,32}){0,2}$/;
const MAX_TIMEZONE_CHARS = 40;
const encoder = new TextEncoder();

export interface Hello {
  ts: number;
  lang: string[];
  hash: string;
  mac: string;
  tz?: string;
  ui?: string;
}

const toHex = (bytes: ArrayBuffer): string => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

const normalizeLanguageTag = (tag: string): string => tag.trim().toLowerCase().replace(/_/g, "-");

function declaredLanguages(): string[] {
  const tags = browserLanguageTags().map(normalizeLanguageTag).filter((tag) => LANGUAGE_TAG_PATTERN.test(tag));
  return [...new Set(tags)].slice(0, MAX_LANGUAGES);
}

function declaredTimezone(): string | undefined {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof zone === "string" && zone.length <= MAX_TIMEZONE_CHARS && TIMEZONE_PATTERN.test(zone) ? zone : undefined;
}

function declaredInterfaceLanguage(): string | undefined {
  const tag = normalizeLanguageTag(getLocale());
  return LANGUAGE_TAG_PATTERN.test(tag) ? tag : undefined;
}

async function sign(seal: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(seal), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

export async function buildHello(): Promise<Hello | undefined> {
  if (!BUILD_SEAL) return undefined;
  const ts = Math.floor(Date.now() / 1000);
  const lang = declaredLanguages();
  const mac = (await sign(BUILD_SEAL, `${ts}\n${lang.join(",")}\n${navigator.userAgent}\n${location.origin}`)).slice(0, MAC_CHARS);
  return { ts, lang, hash: BUILD_SEAL.slice(0, HASH_CHARS), mac, tz: declaredTimezone(), ui: declaredInterfaceLanguage() };
}
