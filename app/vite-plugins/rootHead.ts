import type { Plugin } from "vite";
import type { SiteConfig } from "../src/config/site";
import { DEFAULT_LOCALE } from "../src/i18n/locales.config";
import { escapeHtml } from "../src/utils/escapeHtml";
import { renderShareMeta, shareImageUrl } from "../src/render/shareMeta";
import { readLocaleText } from "./i18n/locales";

const MARKER = "<!--seo:root-head-->";

export function rootHeadPlugin({ siteUrl }: SiteConfig): Plugin {
  const brand = readLocaleText(DEFAULT_LOCALE, "app.brand") ?? "";
  const description = readLocaleText(DEFAULT_LOCALE, "meta.translator.description") ?? "";
  const canonical = `${siteUrl}/${DEFAULT_LOCALE}/`;
  const markup = [
    `<title>${escapeHtml(brand)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    renderShareMeta({ title: brand, description, url: canonical, siteName: brand, locale: DEFAULT_LOCALE, alternateLocales: [], imageUrl: shareImageUrl(siteUrl), imageAlt: brand }),
  ].join("\n    ");
  return {
    name: "root-head",
    transformIndexHtml: (html) => html.replace(MARKER, () => markup),
  };
}
