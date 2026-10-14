import en from "./locales/en.json";
import { LocaleCode, DEFAULT_LOCALE, registerLocale, LocaleMeta } from "./locales.config";

export type KnownTranslationKey = keyof typeof en;
export type TranslationKey = KnownTranslationKey | (string & {});
export type LocaleDictionary = Partial<Record<TranslationKey, string>>;

const DICTIONARIES: Record<string, LocaleDictionary> = { en };

const globFn = typeof import.meta !== "undefined" ? (import.meta as any).glob : undefined;
if (typeof globFn === "function") {
  const localeModules = import.meta.glob("./locales/*.json", { eager: true }) as Record<
    string,
    { default: LocaleDictionary } | LocaleDictionary
  >;
  for (const [path, mod] of Object.entries(localeModules)) {
    const code = path.replace(/^\.\/locales\//, "").replace(/\.json$/, "");
    const dict = ("default" in mod ? mod.default : mod) as LocaleDictionary;
    registerLocale(code);
    DICTIONARIES[code] = { ...DICTIONARIES[code], ...dict };
  }
}

export function registerDictionary(locale: string, dict: LocaleDictionary, meta?: Partial<LocaleMeta>): void {
  registerLocale(locale, meta);
  DICTIONARIES[locale] = { ...DICTIONARIES[locale], ...dict };
}

export function getDictionary(locale: string): LocaleDictionary | undefined {
  return DICTIONARIES[locale];
}

export function translate(locale: LocaleCode, key: TranslationKey, params?: Record<string, string | number>): string {
  let text = DICTIONARIES[locale]?.[key] ?? DICTIONARIES[DEFAULT_LOCALE]?.[key] ?? key;
  if (params) for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value));
  return text;
}
