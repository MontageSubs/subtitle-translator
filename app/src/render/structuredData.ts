import { translate, TranslationKey } from "../i18n/dictionaries";
import { LocaleCode, primaryLanguage } from "../i18n/locales.config";
import { LOCALES } from "../i18n/catalog";
import { ORGANIZATION, REPO_URL, organizationProfilesFor } from "../config/social";
import { isoTimestampOf } from "../config/documentTime";
import type { DocAuthor } from "../types/docs";
import { authorProfileOf } from "../config/authors";

const SCHEMA_CONTEXT = "https://schema.org";
const ORGANIZATION_ID = `${ORGANIZATION.url}#organization`;
const ORGANIZATION_SITE_ID = `${ORGANIZATION.url}#website`;
const ORGANIZATION_LOGO = { path: "logo.png", size: 512 } as const;
const MIT_LICENSE_URL = "https://opensource.org/license/mit";
const TRANSLATOR_FEATURE_COUNT = 11;
const KEYWORD_SEPARATOR = /\s*,\s*/;
const ACCESSIBILITY = {
  accessibilityFeature: ["structuralNavigation", "readingOrder", "displayTransformability"],
  accessibilityControl: ["fullKeyboardControl", "fullMouseControl", "fullTouchControl"],
  accessibilityHazard: ["noFlashingHazard", "noMotionSimulationHazard", "noSoundHazard"],
  accessibilityAPI: ["ARIA"],
  accessMode: ["textual", "visual"],
  accessModeSufficient: { "@type": "ItemList", itemListElement: ["textual"] },
} as const;
const ARTICLE_ACCESSIBILITY = { ...ACCESSIBILITY, accessMode: ["textual"] } as const;
const TRANSLATOR_FEATURE_KEYS: readonly TranslationKey[] = Array.from(
  { length: TRANSLATOR_FEATURE_COUNT },
  (_, index) => `meta.translator.feature.${index + 1}` as TranslationKey,
);
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
  keywords?: string;
  authors: DocAuthor[];
}

const trimTrailingSlash = (url: string): string => url.replace(/\/$/, "");

const sameLanguageLocales = (locale: LocaleCode): LocaleCode[] => LOCALES.filter((code) => primaryLanguage(code) === primaryLanguage(locale));

const aliasesOf = (names: readonly string[], primary: string): string[] => [...new Set(names)].filter((name) => name !== primary);

const brandAliases = (locale: LocaleCode, brand: string): string[] =>
  aliasesOf(sameLanguageLocales(locale).map((code) => translate(code, "app.brand")), brand);

const communityAliases = (locale: LocaleCode): string[] =>
  aliasesOf(sameLanguageLocales(locale).flatMap((code) => translate(code, "meta.organization.names").split(KEYWORD_SEPARATOR)), ORGANIZATION.name);

const aliasesOrUndefined = (aliases: readonly string[]): readonly string[] | undefined => (aliases.length ? aliases : undefined);

const mainSiteNode = (): object => ({ "@type": "WebSite", "@id": ORGANIZATION_SITE_ID, url: ORGANIZATION.url, name: ORGANIZATION.name });

function organizationNode(locale: LocaleCode, siteUrl: string): object {
  const aliases = communityAliases(locale);
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: ORGANIZATION.name,
    alternateName: aliasesOrUndefined(aliases),
    description: translate(locale, "meta.organization.description"),
    url: ORGANIZATION.url,
    logo: { "@type": "ImageObject", url: `${trimTrailingSlash(siteUrl)}/${ORGANIZATION_LOGO.path}`, width: ORGANIZATION_LOGO.size, height: ORGANIZATION_LOGO.size },
    sameAs: organizationProfilesFor(locale),
  };
}

function authorNode(author: DocAuthor): object {
  const profile = authorProfileOf(author.login);
  return {
    "@type": "Person",
    name: profile?.name ?? author.login,
    url: profile?.linkProfile === false ? undefined : `${GITHUB_PROFILE_BASE}/${author.login}`,
  };
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
        organizationNode(page.sourceLocale, siteUrl),
        {
          "@type": page.route && page.route !== "docs" ? "Article" : "TechArticle",
          headline: page.title,
          description: page.summary || undefined,
          keywords: page.keywords,
          url,
          mainEntityOfPage: { "@type": "WebPage", "@id": url },
          isAccessibleForFree: true,
          ...ARTICLE_ACCESSIBILITY,
          accessibilitySummary: translate(page.sourceLocale, "meta.accessibility.summary"),
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
  return [
    {
      "@context": SCHEMA_CONTEXT,
      "@graph": [
        organizationNode(locale, siteUrl),
        {
          "@type": "WebSite",
          "@id": `${base}/#website`,
          name: brand,
          alternateName: aliasesOrUndefined(brandAliases(locale, brand)),
          url: `${base}/`,
          publisher: { "@id": ORGANIZATION_ID },
          isPartOf: mainSiteNode(),
        },
        {
          "@type": "WebApplication",
          name: brand,
          alternateName: aliasesOrUndefined(brandAliases(locale, brand)),
          applicationSubCategory: "Subtitle translation",
          description: text(locale, "meta.translator.description"),
          featureList: TRANSLATOR_FEATURE_KEYS.map((key) => text(locale, key)),
          keywords: text(locale, "meta.translator.keywords"),
          url: `${base}/${locale}/`,
          inLanguage: locale,
          applicationCategory: "MultimediaApplication",
          operatingSystem: "Any",
          softwareVersion: __APP_VERSION__,
          isAccessibleForFree: true,
          ...ACCESSIBILITY,
          accessibilitySummary: text(locale, "meta.accessibility.summary"),
          license: MIT_LICENSE_URL,
          sameAs: [REPO_URL],
          publisher: { "@id": ORGANIZATION_ID },
          isPartOf: mainSiteNode(),
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        },
      ],
    },
  ];
}
