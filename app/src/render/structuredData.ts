import { translate, TranslationKey } from "../i18n/dictionaries";
import { DEFAULT_LOCALE, LocaleCode } from "../i18n/locales.config";
import { LOCALES } from "../i18n/catalog";
import { ORGANIZATION } from "../config/social";
import { isoTimestampOf } from "../config/documentTime";
import type { DocAuthor } from "../types/docs";

const SCHEMA_CONTEXT = "https://schema.org";
const ORGANIZATION_ID = `${ORGANIZATION.url}#organization`;
const BROWSER_REQUIREMENTS = "Requires JavaScript. Requires HTML5.";
const GITHUB_PROFILE_BASE = "https://github.com";
const IMAGE_SOURCE_PATTERN = /<img\b[^>]*?\bsrc="([^"]+)"/i;

interface DocStructuredDataSource {
  title: string;
  summary: string;
  html: string;
  createdAt: string;
  updatedAt: string;
  sourceLocale: LocaleCode;
  route?: string;
  authors: DocAuthor[];
}

const trimTrailingSlash = (url: string): string => url.replace(/\/$/, "");

const brandNamesOf = (text: (locale: LocaleCode, key: TranslationKey) => string, excluding: string): string[] =>
  [...new Set(LOCALES.map((code) => text(code, "app.brand")))].filter((name) => name !== excluding);

function organizationNode(siteUrl: string): object {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: ORGANIZATION.name,
    url: ORGANIZATION.url,
    logo: `${trimTrailingSlash(siteUrl)}/icons/icon-512.png`,
    sameAs: ORGANIZATION.sameAs,
  };
}

function authorNode(author: DocAuthor): object {
  return { "@type": "Person", name: author.login, url: `${GITHUB_PROFILE_BASE}/${author.login}` };
}

function firstImageUrl(html: string, siteUrl: string): string | undefined {
  const source = html.match(IMAGE_SOURCE_PATTERN)?.[1];
  if (!source) return undefined;
  try {
    return new URL(source, `${trimTrailingSlash(siteUrl)}/`).href;
  } catch {
    return undefined;
  }
}

function breadcrumbNode(locale: LocaleCode, siteUrl: string, page: DocStructuredDataSource, url: string): object {
  const base = trimTrailingSlash(siteUrl);
  const brand = translate(locale, "app.brand");
  const trail = [
    { name: brand, url: `${base}/${locale}/` },
    ...(page.route && page.route !== "docs" ? [] : [{ name: translate(locale, "page.docs.title"), url: `${base}/${locale}/docs/` }]),
    { name: page.title, url },
  ];
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })),
  };
}

export function buildDocStructuredData(siteUrl: string, url: string, page: DocStructuredDataSource): object[] {
  const image = firstImageUrl(page.html, siteUrl);
  return [
    {
      "@context": SCHEMA_CONTEXT,
      "@graph": [
        organizationNode(siteUrl),
        {
          "@type": "TechArticle",
          headline: page.title,
          description: page.summary || undefined,
          url,
          inLanguage: page.sourceLocale,
          datePublished: isoTimestampOf(page.createdAt),
          dateModified: isoTimestampOf(page.updatedAt),
          image,
          author: page.authors.length ? page.authors.map(authorNode) : undefined,
          publisher: { "@id": ORGANIZATION_ID },
        },
        breadcrumbNode(page.sourceLocale, siteUrl, page, url),
      ],
    },
  ];
}

export function buildTranslatorStructuredData(locale: LocaleCode, siteUrl: string): object[] {
  const text = (code: LocaleCode, key: TranslationKey) => translate(code, key);
  const base = trimTrailingSlash(siteUrl);
  const brand = text(locale, "app.brand");
  const defaultBrand = text(DEFAULT_LOCALE, "app.brand");
  return [
    {
      "@context": SCHEMA_CONTEXT,
      "@graph": [
        organizationNode(siteUrl),
        {
          "@type": "WebSite",
          "@id": `${base}/#website`,
          name: defaultBrand,
          alternateName: brandNamesOf(text, defaultBrand),
          url: `${base}/`,
          publisher: { "@id": ORGANIZATION_ID },
        },
        {
          "@type": "WebApplication",
          name: brand,
          alternateName: brandNamesOf(text, brand),
          applicationSubCategory: "Subtitle translation",
          description: text(locale, "meta.translator.description"),
          url: `${base}/${locale}/`,
          inLanguage: locale,
          applicationCategory: "MultimediaApplication",
          operatingSystem: "Any",
          browserRequirements: BROWSER_REQUIREMENTS,
          softwareVersion: __APP_VERSION__,
          isAccessibleForFree: true,
          publisher: { "@id": ORGANIZATION_ID },
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        },
      ],
    },
  ];
}
