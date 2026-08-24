import { LOCALES } from "../i18n/locales.config";
import { translate } from "../i18n/dictionaries";
import { renderHeader, renderFooter, ShellContext } from "./shellMarkup";
import { joinPath } from "./paths";
import { BRAND_KEY } from "./metaKeys";

export interface DocumentMeta {
  title: string;
  description: string;
  routeSegments: string[];
  noindex?: boolean;
}

export function renderDocument(ctx: ShellContext, meta: DocumentMeta, bodyHtml: string, assetsHtml: string, siteUrl: string): string {
  const trimmedSite = siteUrl.replace(/\/$/, "");
  const urlFor = (locale: string) => `${trimmedSite}/${[locale, ...meta.routeSegments].join("/")}/`;
  const canonical = urlFor(ctx.locale);
  const brand = translate(ctx.locale, BRAND_KEY);
  const hreflangs = LOCALES.map((locale) => `<link rel="alternate" hreflang="${locale}" href="${urlFor(locale)}" />`).join("\n    ");
  const localePrefetch = LOCALES.filter((locale) => locale !== ctx.locale)
    .map((locale) => `<link rel="prefetch" href="${joinPath(ctx.basePath, [locale, ...meta.routeSegments])}/" />`)
    .join("\n    ");

  return `<!doctype html>
<html lang="${ctx.locale}" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f172a" />
    <title>${meta.title} · ${brand}</title>
    <meta name="description" content="${meta.description}" />
    <meta property="og:title" content="${meta.title} · ${brand}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:type" content="website" />
    <link rel="canonical" href="${canonical}" />
    ${meta.noindex ? `<meta name="robots" content="noindex" />` : ""}
    ${hreflangs}
    <link rel="alternate" hreflang="x-default" href="${urlFor(LOCALES[LOCALES.length - 1])}" />
    ${localePrefetch}
    <link rel="icon" type="image/svg+xml" href="${joinPath(ctx.basePath, ["favicon.svg"])}" />
    ${assetsHtml}
  </head>
  <body>
    <div id="app">
      ${renderHeader(ctx)}
      <div class="shell"><main id="page-outlet">${bodyHtml}</main></div>
      ${renderFooter(ctx)}
    </div>
  </body>
</html>
`;
}
