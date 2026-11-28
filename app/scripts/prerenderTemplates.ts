import { escapeHtml } from "../src/utils/escapeHtml";
import { renderGateBlock, renderGateStyleBlock } from "../vite-plugins/i18n/languageGateDocument";
import { renderGatewayGateScript } from "../vite-plugins/i18n/gateScripts";
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
  seenMatchKey: string;
  indexable: boolean;
  restrictions?: readonly CrawlRestriction[];
  localeNames?: Record<string, string>;
}

export function renderLanguageGatewayPage({ basePath, siteUrl, subPath, canonicalSubPath, brand, locales, defaultLocale, storageKey, seenMatchKey, indexable, restrictions, localeNames, shortName }: GatewayPageOptions): string {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const cleanSub = subPath.replace(/^\/+/, "");
  const canonical = `${siteUrl.replace(/\/$/, "")}/${defaultLocale}/${canonicalSubPath.replace(/^\/+/, "")}`;
  const gateBlock = renderGateBlock(
    locales.map((locale) => ({ locale, label: localeNames?.[locale] ?? locale })),
    (locale) => `${normalizedBase}${locale}/${cleanSub}`,
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
  ${renderGatewayGateScript({ resolver: renderLocaleResolver({ supported: locales, fallback: defaultLocale, storageKey, seenMatchKey }), basePath: normalizedBase, subPath: cleanSub })}
  ${renderGateStyleBlock(locales.map((locale) => localeNames?.[locale] ?? locale))}
</head>
<body>
  ${gateBlock}
</body>
</html>`;
}
