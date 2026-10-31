import { DEFAULT_LOCALE, localeDirection } from "../i18n/locales.config";
import { LOCALES } from "../i18n/catalog";
import { translate } from "../i18n/dictionaries";
import { renderSearchVerificationMeta } from "../config/searchVerification";
import { escapeHtml } from "../utils/escapeHtml";
import { CHANNEL } from "../config/channel";
import { renderHeader, renderFooter, renderAnnouncementBanner, ShellContext } from "./shellMarkup";
import { joinPath } from "./paths";
import { BRAND_KEY, composeDocumentTitle } from "./metaKeys";
import { manifestPath } from "../config/webManifest";
import { COMPACT_LAYOUT_ATTRIBUTE, COMPACT_LAYOUT_VALUE } from "../config/breakpoints";
import { STORAGE_KEYS } from "../config/storage";

interface DocumentMeta {
  title: string;
  description: string;
  routeSegments: string[];
  canonicalRouteSegments?: string[];
  noindex?: boolean;
  jsonLd?: object[];
}

const PAPER_LIGHT = "#faf9f6";
const PAPER_DARK = "#141318";

export const EARLY_THEME_HEAD = `<meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="${PAPER_LIGHT}" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="${PAPER_DARK}" media="(prefers-color-scheme: dark)" />
    <style>html{background:${PAPER_LIGHT}}@media(prefers-color-scheme:dark){html{background:${PAPER_DARK}}}</style>`;

export const EARLY_LAYOUT_SCRIPT = `<script>(function(){try{var c=JSON.parse(localStorage.getItem("${STORAGE_KEYS.compactLayout}")||"{}");var r=document.documentElement;if(c[r.lang+":"+innerWidth]===1)r.setAttribute("${COMPACT_LAYOUT_ATTRIBUTE}","${COMPACT_LAYOUT_VALUE}");var d=localStorage.getItem("${STORAGE_KEYS.noticeDismissedId}");if(d){var s=document.createElement("style");s.textContent=".notice-banner[data-batch-id="+JSON.stringify(d)+"]{display:none}";document.head.appendChild(s)}}catch(e){}})()</script>`;

const OPEN_GRAPH_LOCALES: Record<string, string> = { en: "en_US", "zh-Hans": "zh_CN", "zh-Hant": "zh_TW" };
const SHARE_IMAGE_PATH = "icons/icon-512.png";

const openGraphLocale = (locale: string): string => OPEN_GRAPH_LOCALES[locale] ?? locale.replace("-", "_");

export function renderDocument(ctx: ShellContext, meta: DocumentMeta, bodyHtml: string, assetsHtml: string, siteUrl: string): string {
  const trimmedSite = siteUrl.replace(/\/$/, "");
  const urlFor = (locale: string) => `${trimmedSite}/${[locale, ...(meta.canonicalRouteSegments ?? meta.routeSegments)].join("/")}/`;
  const canonical = urlFor(ctx.locale);
  const brand = translate(ctx.locale, BRAND_KEY);
  const title = escapeHtml(composeDocumentTitle(meta.title, brand));
  const description = escapeHtml(meta.description);
  const hreflangs = LOCALES.map((locale) => `<link rel="alternate" hreflang="${locale}" href="${urlFor(locale)}" />`).join("\n    ");
  const ogAlternateLocales = LOCALES.filter((locale) => locale !== ctx.locale)
    .map((locale) => `<meta property="og:locale:alternate" content="${openGraphLocale(locale)}" />`)
    .join("\n    ");
  const structuredData = (meta.jsonLd ?? [])
    .map((entry) => `<script type="application/ld+json">${JSON.stringify(entry).replace(/</g, "\\u003c")}</script>`)
    .join("\n    ");

  return `<!doctype html>
<html lang="${ctx.locale}" dir="${localeDirection(ctx.locale)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${EARLY_THEME_HEAD}
    <meta name="app-version" content="${__APP_VERSION__}" />
    <meta name="application-name" content="${escapeHtml(brand)}" />
    <meta name="apple-mobile-web-app-title" content="${escapeHtml(brand)}" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    ${renderSearchVerificationMeta(import.meta.env)}
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:site_name" content="${escapeHtml(brand)}" />
    <meta property="og:locale" content="${openGraphLocale(ctx.locale)}" />
    ${ogAlternateLocales}
    <meta property="og:image" content="${trimmedSite}/${SHARE_IMAGE_PATH}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:image" content="${trimmedSite}/${SHARE_IMAGE_PATH}" />
    <link rel="canonical" href="${canonical}" />
    ${meta.noindex || !CHANNEL.indexable ? `<meta name="robots" content="noindex" />` : ""}
    ${hreflangs}
    <link rel="alternate" hreflang="x-default" href="${urlFor(DEFAULT_LOCALE)}" />
    <link rel="icon" type="image/svg+xml" href="${joinPath(ctx.basePath, ["favicon.svg"])}" />
    <link rel="apple-touch-icon" href="${joinPath(ctx.basePath, ["icons", "icon-maskable-192.png"])}" />
    <link rel="manifest" href="${joinPath(ctx.basePath, [manifestPath(ctx.locale)])}" />
    ${structuredData}
    ${EARLY_LAYOUT_SCRIPT}
    ${assetsHtml}
    <noscript><style>[data-requires-js]{display:none}</style></noscript>
  </head>
  <body>
    <div id="app">
      ${renderHeader(ctx)}
      ${renderAnnouncementBanner(ctx)}
      <div class="shell"><main id="page-outlet" tabindex="-1">${bodyHtml}</main></div>
      ${renderFooter(ctx)}
    </div>
  </body>
</html>
`;
}
