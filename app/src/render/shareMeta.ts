import { escapeHtml } from "../utils/escapeHtml";
import { openGraphLocale } from "../config/openGraphLocale";
import { isoTimestampOf } from "../config/documentTime";
import type { LocaleCode } from "../i18n/locales.config";

export const SHARE_IMAGE = { path: "share-image.png", width: 1200, height: 630, type: "image/png" } as const;

export interface ArticleTimes {
  publishedTime?: string;
  modifiedTime?: string;
}

export interface ShareMeta {
  title: string;
  description: string;
  url: string;
  siteName: string;
  locale: LocaleCode;
  alternateLocales: readonly LocaleCode[];
  imageUrl: string;
  imageAlt: string;
  article?: ArticleTimes;
}

export const shareImageUrl = (siteUrl: string): string => `${siteUrl.replace(/\/$/, "")}/${SHARE_IMAGE.path}`;

const property = (name: string, content: string): string => `<meta property="${name}" content="${escapeHtml(content)}" />`;
const named = (name: string, content: string): string => `<meta name="${name}" content="${escapeHtml(content)}" />`;

export function renderShareMeta(meta: ShareMeta): string {
  const published = isoTimestampOf(meta.article?.publishedTime);
  const modified = isoTimestampOf(meta.article?.modifiedTime);
  return [
    property("og:title", meta.title),
    property("og:description", meta.description),
    property("og:type", meta.article ? "article" : "website"),
    property("og:url", meta.url),
    property("og:site_name", meta.siteName),
    property("og:locale", openGraphLocale(meta.locale)),
    ...meta.alternateLocales.map((locale) => property("og:locale:alternate", openGraphLocale(locale))),
    property("og:image", meta.imageUrl),
    property("og:image:width", String(SHARE_IMAGE.width)),
    property("og:image:height", String(SHARE_IMAGE.height)),
    property("og:image:type", SHARE_IMAGE.type),
    property("og:image:alt", meta.imageAlt),
    ...(published ? [property("article:published_time", published)] : []),
    ...(modified ? [property("article:modified_time", modified)] : []),
    named("twitter:card", "summary_large_image"),
    named("twitter:title", meta.title),
    named("twitter:description", meta.description),
    named("twitter:image", meta.imageUrl),
  ].join("\n    ");
}
