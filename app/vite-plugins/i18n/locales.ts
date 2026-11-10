import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LOCALE, LocaleCode, isWellFormedLocale, orderLocales } from "../../src/i18n/locales.config";
import { namespaced } from "../../src/metadata/namespace";

export const LOCALES_DIR = fileURLToPath(new URL("../../src/i18n/locales/", import.meta.url));

export const METADATA_DIR = fileURLToPath(new URL("../../src/metadata/", import.meta.url));

const JSON_SUFFIX = ".json";

const localeOfFile = (file: string): LocaleCode => file.slice(0, -JSON_SUFFIX.length);

export function localeFileNames(): string[] {
  return readdirSync(LOCALES_DIR).filter((file) => file.endsWith(JSON_SUFFIX));
}

export function isLocaleFile(file: string): boolean {
  return isWellFormedLocale(localeOfFile(file));
}

export function discoverLocales(): LocaleCode[] {
  return orderLocales(localeFileNames().map(localeOfFile));
}

export function readLocaleDictionary(locale: LocaleCode): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(LOCALES_DIR, `${locale}${JSON_SUFFIX}`), "utf-8"));
}

export function readLocaleText(locale: LocaleCode, key: string): string | undefined {
  const text = readLocaleDictionary(locale)[key] || readLocaleDictionary(DEFAULT_LOCALE)[key];
  if (typeof text !== "string") return undefined;
  const brand = readLocaleDictionary(locale)["app.brand"] || readLocaleDictionary(DEFAULT_LOCALE)["app.brand"];
  return typeof brand === "string" ? text.replaceAll("{brand}", brand) : text;
}

export function readMetadataCatalog(locale: LocaleCode): Record<string, string> {
  const file = resolve(METADATA_DIR, `${locale}${JSON_SUFFIX}`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : {};
}

export function readMetadataText(locale: LocaleCode, key: string): string | undefined {
  const text = readMetadataCatalog(locale)[key];
  const brand = readLocaleDictionary(locale)["app.brand"] || readLocaleDictionary(DEFAULT_LOCALE)["app.brand"];
  return text && typeof brand === "string" ? text.replaceAll("{brand}", brand) : text;
}

export const readPackDictionary = (locale: LocaleCode): Record<string, unknown> => ({ ...readLocaleDictionary(locale), ...namespaced(readMetadataCatalog(locale)) });

export function readNativeName(locale: LocaleCode): string {
  const curated = readLocaleDictionary(locale)[`language.name.${locale}`];
  if (typeof curated === "string" && curated) return curated;
  const intlName = Intl.DisplayNames.supportedLocalesOf([locale]).length
    ? new Intl.DisplayNames([locale], { type: "language" }).of(locale)
    : undefined;
  return intlName && intlName !== locale ? intlName : locale;
}
