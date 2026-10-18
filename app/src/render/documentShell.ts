import { DEFAULT_LOCALE, localeDirection } from "../i18n/locales.config";
import { LOCALES } from "../i18n/catalog";
import { translate } from "../i18n/dictionaries";
import { renderSearchVerificationMeta } from "../config/searchVerification";
import { escapeHtml } from "../utils/escapeHtml";
import { renderHeader, renderFooter, renderAnnouncementBanner, ShellContext } from "./shellMarkup";
import { joinPath } from "./paths";
import { BRAND_KEY } from "./metaKeys";
import { manifestFileName } from "../config/webManifest";
import { EARLY_LAYOUT_SCRIPT } from "./earlyLayoutScript";
import { EARLY_THEME_HEAD } from "./earlyThemeStyle";

export interface DocumentMeta {
  title: string;
  description: string;
  routeSegments: string[];
  canonicalRouteSegments?: string[];
  noindex?: boolean;
  jsonLd?: object[];
}

const OPEN_GRAPH_LOCALES: Record<string, string> = { en: "en_US", "zh-Hans": "zh_CN", "zh-Hant": "zh_TW" };
const SHARE_IMAGE_PATH = "icons/icon-512.png";

const openGraphLocale = (locale: string): string => OPEN_GRAPH_LOCALES[locale] ?? locale.replace("-", "_");

export function renderDocument(ctx: ShellContext, meta: DocumentMeta, bodyHtml: string, assetsHtml: string, siteUrl: string): string {
  const trimmedSite = siteUrl.replace(/\/$/, "");
  const urlFor = (locale: string) => `${trimmedSite}/${[locale, ...(meta.canonicalRouteSegments ?? meta.routeSegments)].join("/")}/`;
  const canonical = urlFor(ctx.locale);
  const brand = translate(ctx.locale, BRAND_KEY);
  const title = escapeHtml(`${meta.title} · ${brand}`);
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
    ${meta.noindex ? `<meta name="robots" content="noindex" />` : ""}
    ${hreflangs}
    <link rel="alternate" hreflang="x-default" href="${urlFor(DEFAULT_LOCALE)}" />
    <link rel="icon" type="image/svg+xml" href="${joinPath(ctx.basePath, ["favicon.svg"])}" />
    <link rel="manifest" href="${joinPath(ctx.basePath, [manifestFileName(ctx.locale)])}" />
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
