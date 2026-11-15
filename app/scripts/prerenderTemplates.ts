import { escapeHtml } from "../src/utils/escapeHtml";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderLanguageGateOptions, renderLanguageGateStyle, sortGateLocales } from "../src/render/languageGate";
import { renderLocaleResolver } from "../vite-plugins/i18n/localeGate";
import { robotsMetaTag } from "../src/config/robots";
import { renderIconLinks } from "../src/render/iconLinks";
import { appleTouchIconHref } from "../vite-plugins/iconLinks";
import type { CrawlRestriction } from "../src/config/crawlPolicy";

export interface GatewayPageOptions {
  basePath: string;
  siteUrl: string;
  subPath: string;
  canonicalSubPath: string;
  brand: string;
  shortName: string;
  locales: readonly string[];
  defaultLocale: string;
  storageKey: string;
  indexable: boolean;
  restrictions?: readonly CrawlRestriction[];
  localeNames?: Record<string, string>;
}

const FONTS_CSS = readFileSync(resolve(process.cwd(), "src/styles/fonts.css"), "utf8");

export function renderLanguageGatewayPage({ basePath, siteUrl, subPath, canonicalSubPath, brand, locales, defaultLocale, storageKey, indexable, restrictions, localeNames, shortName }: GatewayPageOptions): string {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const cleanSub = subPath.replace(/^\/+/, "");
  const canonical = `${siteUrl.replace(/\/$/, "")}/${defaultLocale}/${canonicalSubPath.replace(/^\/+/, "")}`;
  const links = renderLanguageGateOptions(
    sortGateLocales(locales).map((loc) => ({ href: `${normalizedBase}${loc}/${cleanSub}`, locale: loc, label: localeNames?.[loc] ?? loc })),
    "        ",
  );
  return `<!doctype html>
<html lang="${defaultLocale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(brand)}</title>
  ${robotsMetaTag(indexable, restrictions)}
  <link rel="canonical" href="${canonical}" />
  <meta name="application-name" content="${escapeHtml(brand)}" />
  <meta name="apple-mobile-web-app-title" content="${escapeHtml(shortName)}" />
  ${renderIconLinks(normalizedBase, appleTouchIconHref())}
  <script>
    (function () {
      var target = ${renderLocaleResolver({ supported: locales, fallback: defaultLocale, storageKey })};
      location.replace(${JSON.stringify(normalizedBase)} + target + "/" + ${JSON.stringify(cleanSub)} + (location.search || "") + (location.hash || ""));
    })();
  </script>
  <noscript>
    <style>
        ${renderLanguageGateStyle(FONTS_CSS)}
    </style>
  </noscript>
</head>
<body>
  <noscript>
    <div class="language-gate">
      <h1>Select Language</h1>
      ${links}
    </div>
  </noscript>
</body>
</html>`;
}
