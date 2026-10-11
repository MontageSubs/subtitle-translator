import { translate } from "../i18n/dictionaries";
import type { LocaleCode } from "../i18n/locales.config";

type LanguageCode = string;

type NameLocale = "en" | "zh";

const NAME_LOCALES: Record<LocaleCode, NameLocale> = { en: "en", "zh-Hans": "zh", "zh-Hant": "zh" };

const NAME_OVERRIDES: Record<LanguageCode, Partial<Record<NameLocale, string>>> = {
  alz: { en: "Alur", zh: "阿卢尔语" },
  bbc: { zh: "托巴巴塔克语" },
  bew: { zh: "贝塔维语" },
  bts: { en: "Batak Simalungun", zh: "西马伦贡巴塔克语" },
  btx: { en: "Batak Karo", zh: "卡罗巴塔克语" },
  cnh: { en: "Hakha Chin", zh: "哈卡钦语" },
  dov: { en: "Dombe", zh: "多姆贝语" },
  hrx: { en: "Hunsrik", zh: "洪斯吕克语" },
  kri: { zh: "克里奥语" },
  ktu: { en: "Kituba", zh: "基图巴语" },
  ltg: { zh: "拉特加莱语" },
  tl: { en: "Tagalog", zh: "他加禄语" },
  yua: { en: "Yucatec Maya", zh: "尤卡坦玛雅语" },
};

const namers = new Map<string, Intl.DisplayNames>();

function intlName(code: LanguageCode, locale: string): string | undefined {
  const namer = namers.get(locale) ?? new Intl.DisplayNames([locale], { type: "language" });
  namers.set(locale, namer);
  const name = namer.of(code);
  return name && name !== code ? name : undefined;
}

export function languageName(code: LanguageCode, locale: LocaleCode): string {
  return NAME_OVERRIDES[code]?.[NAME_LOCALES[locale]] ?? intlName(code, locale) ?? intlName(code, "en") ?? code;
}

const NATIVE_OVERRIDES: Record<LanguageCode, string> = { tl: "Tagalog" };

const nativeNames = new Map<LanguageCode, string | undefined>();

function nativeLanguageName(code: LanguageCode): string | undefined {
  if (!nativeNames.has(code)) {
    const supported = Intl.DisplayNames.supportedLocalesOf([code]).length > 0;
    nativeNames.set(code, NATIVE_OVERRIDES[code] ?? (supported ? intlName(code, code) : undefined));
  }
  return nativeNames.get(code);
}

export function formatLanguage(code: LanguageCode, locale: LocaleCode): string {
  const name = languageName(code, locale);
  const native = nativeLanguageName(code);
  return native && native.toLowerCase() !== name.toLowerCase() ? translate(locale, "language.withNative", { name, native }) : name;
}
