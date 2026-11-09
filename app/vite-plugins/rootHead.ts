import type { Plugin } from "vite";
import type { SiteConfig } from "../src/config/site";
import { DEFAULT_LOCALE } from "../src/i18n/locales.config";
import { escapeHtml } from "../src/utils/escapeHtml";
import { renderShareMeta, shareImageUrl } from "../src/render/shareMeta";
import { renderIconLinks } from "../src/render/iconLinks";
import { appleTouchIconHref } from "./iconLinks";
import { readLocaleText } from "./i18n/locales";

const MARKER = "<!--seo:root-head-->";

export function rootHeadPlugin({ siteUrl }: SiteConfig): Plugin {
  let basePath = "/";
  const brand = readLocaleText(DEFAULT_LOCALE, "app.brand") ?? "";
  const title = readLocaleText(DEFAULT_LOCALE, "app.homeTitle") ?? brand;
  const description = readLocaleText(DEFAULT_LOCALE, "meta.translator.description") ?? "";
  const keywords = readLocaleText(DEFAULT_LOCALE, "meta.translator.keywords") ?? "";
  const shortName = readLocaleText(DEFAULT_LOCALE, "app.shortName") ?? brand;
  const canonical = `${siteUrl}/${DEFAULT_LOCALE}/`;
  const markup = () => [
    `<meta name="application-name" content="${escapeHtml(brand)}" />`,
    `<meta name="apple-mobile-web-app-title" content="${escapeHtml(shortName)}" />`,
    renderIconLinks(basePath, appleTouchIconHref()),
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta name="keywords" content="${escapeHtml(keywords)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    renderShareMeta({ title, description, url: canonical, siteName: brand, locale: DEFAULT_LOCALE, alternateLocales: [], imageUrl: shareImageUrl(siteUrl), imageAlt: brand }),
  ].join("\n    ");
  return {
    name: "root-head",
    configResolved(config) {
      basePath = config.base;
    },
    transformIndexHtml: (html) => html.replace(MARKER, () => markup()),
  };
}
