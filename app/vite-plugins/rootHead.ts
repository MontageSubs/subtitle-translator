import type { Plugin } from "vite";
import type { SiteConfig } from "../src/config/site";
import { DEFAULT_LOCALE } from "../src/i18n/locales.config";
import { escapeHtml } from "../src/utils/escapeHtml";
import { renderShareMeta, shareImageUrl } from "../src/render/shareMeta";
import { renderIconLinks } from "../src/render/iconLinks";
import { appleTouchIconHref } from "./iconLinks";
import { readLocaleText, readMetadataText } from "./i18n/locales";

const MARKER = "<!--root-head-->";

export function rootHeadPlugin({ siteUrl }: SiteConfig): Plugin {
  let basePath = "/";
  const brand = readLocaleText(DEFAULT_LOCALE, "app.brand") ?? "";
  const title = readMetadataText(DEFAULT_LOCALE, "page.translator.title") ?? brand;
  const description = readMetadataText(DEFAULT_LOCALE, "page.translator.description");
  const keywords = readMetadataText(DEFAULT_LOCALE, "page.translator.keywords");
  const shortName = readMetadataText(DEFAULT_LOCALE, "app.shortName") ?? brand;
  const canonical = `${siteUrl}/${DEFAULT_LOCALE}/`;
  const markup = () =>
    [
      `<meta name="application-name" content="${escapeHtml(brand)}" />`,
      `<meta name="apple-mobile-web-app-title" content="${escapeHtml(shortName)}" />`,
      renderIconLinks(basePath, appleTouchIconHref()),
      `<title>${escapeHtml(title)}</title>`,
      description && `<meta name="description" content="${escapeHtml(description)}" />`,
      keywords && `<meta name="keywords" content="${escapeHtml(keywords)}" />`,
      `<link rel="canonical" href="${canonical}" />`,
      renderShareMeta({ title, description, url: canonical, siteName: brand, locale: DEFAULT_LOCALE, alternateLocales: [], imageUrl: shareImageUrl(siteUrl), imageAlt: brand }),
    ]
      .filter(Boolean)
      .join("\n    ");
  return {
    name: "root-head",
    configResolved(config) {
      basePath = config.base;
    },
    transformIndexHtml: (html) => html.replace(MARKER, () => markup()),
  };
}
