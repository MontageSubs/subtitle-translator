import { translate, TranslationKey } from "../i18n/dictionaries";
import { LocaleCode } from "../i18n/locales.config";

const SCHEMA_CONTEXT = "https://schema.org";

export function buildTranslatorStructuredData(locale: LocaleCode, url: string): object[] {
  const text = (key: TranslationKey) => translate(locale, key);
  return [
    {
      "@context": SCHEMA_CONTEXT,
      "@type": "SoftwareApplication",
      name: text("brand.name"),
      description: text("app.tagline"),
      url,
      inLanguage: locale,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Any",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ];
}
