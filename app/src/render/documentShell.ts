import { DEFAULT_LOCALE, localeDirection, type LocaleCode } from "../i18n/locales.config";
import { translate } from "../i18n/dictionaries";
import { renderSearchVerificationMeta } from "../config/searchVerification";
import { escapeHtml } from "../utils/escapeHtml";
import { CHANNEL } from "../config/channel";
import { robotsMetaTag } from "../config/robots";
import { renderHeader, renderFooter, renderAnnouncementBanner, ShellContext } from "./shellMarkup";
import { joinPath } from "./paths";
import { BRAND_KEY, composeDocumentTitle } from "./metaKeys";
import { renderShareMeta, shareImageUrl, type ArticleTimes } from "./shareMeta";
import { manifestPath } from "../config/webManifest";
import { COMPACT_LAYOUT_ATTRIBUTE, COMPACT_LAYOUT_VALUE } from "../config/breakpoints";
import { STORAGE_KEYS } from "../config/storage";

interface DocumentMeta {
  title: string;
  description: string;
  routeSegments: string[];
  canonicalRouteSegments?: string[];
  translatedLocales: readonly LocaleCode[];
  noindex?: boolean;
  article?: ArticleTimes;
  jsonLd?: object[];
}

const PAPER_LIGHT = "#faf9f6";
const PAPER_DARK = "#141318";

export const EARLY_THEME_HEAD = `<meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="${PAPER_LIGHT}" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="${PAPER_DARK}" media="(prefers-color-scheme: dark)" />
    <style>html{background:${PAPER_LIGHT}}@media(prefers-color-scheme:dark){html{background:${PAPER_DARK}}}</style>`;

export const EARLY_LAYOUT_SCRIPT = `<script>(function(){try{var c=JSON.parse(localStorage.getItem("${STORAGE_KEYS.compactLayout}")||"{}");var r=document.documentElement;if(c[r.lang+":"+innerWidth]===1)r.setAttribute("${COMPACT_LAYOUT_ATTRIBUTE}","${COMPACT_LAYOUT_VALUE}");var d=localStorage.getItem("${STORAGE_KEYS.noticeDismissedId}");if(d){var s=document.createElement("style");s.textContent=".notice-banner[data-batch-id="+JSON.stringify(d)+"]{display:none}";document.head.appendChild(s)}}catch(e){}})()</script>`;

export function renderDocument(ctx: ShellContext, meta: DocumentMeta, bodyHtml: string, assetsHtml: string, siteUrl: string): string {
  const trimmedSite = siteUrl.replace(/\/$/, "");
  const urlFor = (locale: string) => `${trimmedSite}/${[locale, ...(meta.canonicalRouteSegments ?? meta.routeSegments)].join("/")}/`;
  const hasOwnTranslation = meta.translatedLocales.includes(ctx.locale);
  const canonical = urlFor(hasOwnTranslation ? ctx.locale : DEFAULT_LOCALE);
  const brand = translate(ctx.locale, BRAND_KEY);
  const title = escapeHtml(composeDocumentTitle(meta.title, brand));
  const description = escapeHtml(meta.description);
  const languageLinks = hasOwnTranslation
    ? [
        ...meta.translatedLocales.map((locale) => `<link rel="alternate" hreflang="${locale}" href="${urlFor(locale)}" />`),
        `<link rel="alternate" hreflang="x-default" href="${urlFor(DEFAULT_LOCALE)}" />`,
      ].join("\n    ")
    : "";
  const shareMeta = renderShareMeta({
    title: composeDocumentTitle(meta.title, brand),
    description: meta.description,
    url: canonical,
    siteName: brand,
    locale: hasOwnTranslation ? ctx.locale : DEFAULT_LOCALE,
    alternateLocales: hasOwnTranslation ? meta.translatedLocales.filter((locale) => locale !== ctx.locale) : [],
    imageUrl: shareImageUrl(trimmedSite),
    imageAlt: brand,
    article: meta.article,
  });
  const structuredData = (meta.jsonLd ?? [])
    .map((entry) => `<script type="application/ld+json">${JSON.stringify(entry).replace(/</g, "\\u003c")}</script>`)
    .join("\n    ");

  return `<!doctype html>
<html lang="${ctx.locale}" dir="${localeDirection(ctx.locale)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    ${EARLY_THEME_HEAD}
    <meta name="app-version" content="${__APP_VERSION__}" />
    <meta name="application-name" content="${escapeHtml(brand)}" />
    <meta name="apple-mobile-web-app-title" content="${escapeHtml(brand)}" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    ${renderSearchVerificationMeta(import.meta.env, ctx.locale)}
    ${shareMeta}
    <link rel="canonical" href="${canonical}" />
    ${robotsMetaTag(CHANNEL.indexable && !meta.noindex)}
    ${languageLinks}
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
