import { translate, TranslationKey } from "../i18n/dictionaries";
import { LocaleCode } from "../i18n/locales.config";
import { LOCALES } from "../i18n/catalog";

const SCHEMA_CONTEXT = "https://schema.org";
const PUBLISHER = { "@type": "Organization", name: "MontageSubs" };

export function buildDocStructuredData(locale: LocaleCode, url: string, page: { title: string; summary: string; createdAt: string; updatedAt: string }): object[] {
  return [
    {
      "@context": SCHEMA_CONTEXT,
      "@type": "TechArticle",
      headline: page.title,
      description: page.summary || undefined,
      url,
      inLanguage: locale,
      datePublished: page.createdAt || undefined,
      dateModified: page.updatedAt || undefined,
      publisher: PUBLISHER,
    },
  ];
}

export function buildTranslatorStructuredData(locale: LocaleCode, url: string): object[] {
  const text = (key: TranslationKey) => translate(locale, key);
  return [
    {
      "@context": SCHEMA_CONTEXT,
      "@type": "SoftwareApplication",
      name: text("brand.name"),
      alternateName: [...new Set(LOCALES.map((code) => translate(code, "brand.name")))].filter((name) => name !== text("brand.name")),
      applicationSubCategory: "Subtitle translation",
      description: text("meta.translator.description"),
      url,
      inLanguage: locale,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Any",
      isAccessibleForFree: true,
      publisher: PUBLISHER,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ];
}
