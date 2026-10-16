import { DEFAULT_LOCALE, localeDirection } from "../i18n/locales.config";
import { LOCALES } from "../i18n/catalog";
import { translate } from "../i18n/dictionaries";
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
  noindex?: boolean;
  jsonLd?: object[];
}

export function renderDocument(ctx: ShellContext, meta: DocumentMeta, bodyHtml: string, assetsHtml: string, siteUrl: string): string {
  const trimmedSite = siteUrl.replace(/\/$/, "");
  const urlFor = (locale: string) => `${trimmedSite}/${[locale, ...meta.routeSegments].join("/")}/`;
  const canonical = urlFor(ctx.locale);
  const brand = translate(ctx.locale, BRAND_KEY);
  const hreflangs = LOCALES.map((locale) => `<link rel="alternate" hreflang="${locale}" href="${urlFor(locale)}" />`).join("\n    ");
  const structuredData = (meta.jsonLd ?? [])
    .map((entry) => `<script type="application/ld+json">${JSON.stringify(entry).replace(/</g, "\\u003c")}</script>`)
    .join("\n    ");
  const localePrefetch = LOCALES.filter((locale) => locale !== ctx.locale)
    .map((locale) => `<link rel="prefetch" href="${joinPath(ctx.basePath, [locale, ...meta.routeSegments])}/" />`)
    .join("\n    ");

  return `<!doctype html>
<html lang="${ctx.locale}" dir="${localeDirection(ctx.locale)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${EARLY_THEME_HEAD}
    <meta name="app-version" content="${__APP_VERSION__}" />
    <title>${meta.title} · ${brand}</title>
    <meta name="description" content="${meta.description}" />
    <meta property="og:title" content="${meta.title} · ${brand}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:site_name" content="${brand}" />
    <meta name="twitter:card" content="summary" />
    <link rel="canonical" href="${canonical}" />
    ${meta.noindex ? `<meta name="robots" content="noindex" />` : ""}
    ${hreflangs}
    <link rel="alternate" hreflang="x-default" href="${urlFor(DEFAULT_LOCALE)}" />
    ${localePrefetch}
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
