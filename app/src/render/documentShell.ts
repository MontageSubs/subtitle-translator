import { LOCALES } from "../i18n/locales.config";
import { renderHeader, renderFooter, ShellContext } from "./shellMarkup";
import { joinPath } from "./paths";
import { SITE_NAME } from "./metaKeys";

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
  const hreflangs = LOCALES.map((locale) => `<link rel="alternate" hreflang="${locale}" href="${urlFor(locale)}" />`).join("\n    ");

  return `<!doctype html>
<html lang="${ctx.locale}" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f172a" />
    <title>${meta.title} · ${SITE_NAME}</title>
    <meta name="description" content="${meta.description}" />
    <meta property="og:title" content="${meta.title} · ${SITE_NAME}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:type" content="website" />
    <link rel="canonical" href="${canonical}" />
    ${meta.noindex ? `<meta name="robots" content="noindex" />` : ""}
    ${hreflangs}
    <link rel="alternate" hreflang="x-default" href="${urlFor(LOCALES[LOCALES.length - 1])}" />
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
