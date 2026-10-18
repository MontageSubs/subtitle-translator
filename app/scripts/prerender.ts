import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { resolveSiteConfig } from "../src/config/site";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LocaleCode } from "../src/i18n/locales.config";
import { HOME_PAGE_ID } from "../src/render/paths";
import type { DocPage } from "../src/types/docs";
import { renderLanguageGatewayPage } from "./prerenderTemplates";
import { discoverLocales, readNativeName } from "../vite-plugins/i18n/locales";

type SsrEntry = typeof import("../src/render/ssrEntry");

interface Prerender {
  ssr: SsrEntry;
  assetsHtml: string;
}

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = resolve(APP_DIR, "dist");
const BASE_PATH = process.env.VITE_BASE_PATH || "/";
const SITE_URL = resolveSiteConfig(process.env).siteUrl;

const LOCALES = discoverLocales();

const HOME_PAGE_CHUNK = "translatorPage";
const MARKDOWN_PAGES = ["about", "tools", "contribute"] as const;
const NON_SCRIPT_PAGES: ReadonlySet<string> = new Set(["docs", HOME_PAGE_ID, ...MARKDOWN_PAGES]);
const GATEWAY_SEGMENTS = [...MARKDOWN_PAGES, "history", "discussions"];

function extractBuiltAssets(): string {
  const html = readFileSync(resolve(DIST_DIR, "index.html"), "utf-8");
  const tags = html.match(/<link[^>]+rel="(?:stylesheet|modulepreload)"[^>]*>|<script[^>]+src="[^"]+"[^>]*><\/script>/g) ?? [];
  return tags.join("\n    ");
}

function chunkPreload(chunkName: string): string {
  const chunk = readdirSync(resolve(DIST_DIR, "assets")).find((name) => new RegExp(`^${chunkName}-[\\w-]{8}\\.js$`).test(name));
  return chunk ? `<link rel="modulepreload" crossorigin href="${BASE_PATH.replace(/\/?$/, "/")}assets/${chunk}">` : "";
}

function writePage(routeSegments: string[], html: string): void {
  const outDir = resolve(DIST_DIR, ...routeSegments);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "index.html"), html);
}

function writeMarkdownPages({ ssr, assetsHtml }: Prerender, locale: LocaleCode): void {
  for (const page of MARKDOWN_PAGES) {
    const content = ssr.staticPages[page].find((candidate) => candidate.locale === locale)
      ?? ssr.staticPages[page].find((candidate) => candidate.locale === DEFAULT_LOCALE);
    const body = ssr.renderStaticPageBody(locale, content, `page.${page}.placeholder` as const);
    const meta = { title: ssr.translate(locale, ssr.TITLE_KEYS[page]), description: ssr.translate(locale, ssr.DESCRIPTION_KEYS[page]), routeSegments: [page] };
    writePage([locale, page], ssr.renderDocument({ locale, page, basePath: BASE_PATH }, meta, body, assetsHtml, SITE_URL));
  }
}

function writeDocsPages({ ssr, assetsHtml }: Prerender, locale: LocaleCode): void {
  const pages = ssr.docPages.filter((page) => page.locale === locale);
  const fallbackPages = pages.length > 0 ? pages : ssr.docPages.filter((page) => page.locale === DEFAULT_LOCALE);
  const listMeta = { title: ssr.translate(locale, ssr.TITLE_KEYS.docs), description: ssr.translate(locale, ssr.DESCRIPTION_KEYS.docs), routeSegments: ["docs"] };
  writePage([locale, "docs"], ssr.renderDocument({ locale, page: "docs", basePath: BASE_PATH }, listMeta, ssr.renderDocsListBody(locale, BASE_PATH, fallbackPages, "newest"), assetsHtml, SITE_URL));

  for (const page of fallbackPages) {
    const canonicalSegments = page.route && page.route !== "docs" ? [page.route] : ["docs", page.slug];
    const meta = {
      title: page.title,
      description: page.summary || ssr.translate(locale, "meta.docs.description"),
      routeSegments: ["docs", page.slug],
      canonicalRouteSegments: canonicalSegments,
      jsonLd: ssr.buildDocStructuredData(locale, `${SITE_URL}/${[locale, ...canonicalSegments].join("/")}/`, page),
    };
    const context = { locale, page: "docs" as const, basePath: BASE_PATH, rest: [page.slug] };
    writePage([locale, "docs", page.slug], ssr.renderDocument(context, meta, ssr.renderDocsDetailBody(locale, BASE_PATH, page), assetsHtml, SITE_URL));
  }
}

function writeHomePage({ ssr, assetsHtml }: Prerender, locale: LocaleCode): void {
  const meta = { title: ssr.translate(locale, ssr.TITLE_KEYS[HOME_PAGE_ID]), description: ssr.translate(locale, ssr.DESCRIPTION_KEYS[HOME_PAGE_ID]), routeSegments: [], jsonLd: ssr.buildTranslatorStructuredData(locale, `${SITE_URL}/${locale}/`) };
  const assets = `${assetsHtml}\n    ${chunkPreload(HOME_PAGE_CHUNK)}`;
  writePage([locale], ssr.renderDocument({ locale, page: HOME_PAGE_ID, basePath: BASE_PATH }, meta, ssr.renderJsRequiredBody(locale, HOME_PAGE_ID), assets, SITE_URL));
}

function writeScriptOnlyPages({ ssr, assetsHtml }: Prerender, locale: LocaleCode): void {
  for (const page of ssr.PAGE_IDS.filter((candidate) => !NON_SCRIPT_PAGES.has(candidate))) {
    const meta = { title: ssr.translate(locale, ssr.TITLE_KEYS[page]), description: ssr.translate(locale, ssr.DESCRIPTION_KEYS[page]), routeSegments: [page], noindex: page === "history" };
    writePage([locale, page], ssr.renderDocument({ locale, page, basePath: BASE_PATH }, meta, ssr.renderJsRequiredBody(locale, page), assetsHtml, SITE_URL));
  }
}

function writeGatewayPages(docPages: DocPage[]): void {
  const localeNames = Object.fromEntries(LOCALES.map((loc) => [loc, readNativeName(loc)]));
  const gateway = (subPath: string) => renderLanguageGatewayPage({ basePath: BASE_PATH, subPath, locales: LOCALES, defaultLocale: DEFAULT_LOCALE, storageKey: LOCALE_STORAGE_KEY, localeNames });
  for (const segment of GATEWAY_SEGMENTS) writePage([segment], gateway(`${segment}/`));
  writePage(["docs"], gateway("docs/"));
  for (const slug of new Set(docPages.map((page) => page.slug))) writePage(["docs", slug], gateway(`docs/${slug}/`));
}

async function main(): Promise<void> {
  const vite = await createServer({ root: APP_DIR, server: { middlewareMode: true }, appType: "custom" });
  try {
    const ssr = (await vite.ssrLoadModule("/src/render/ssrEntry.ts")) as SsrEntry;
    const prerender: Prerender = { ssr, assetsHtml: extractBuiltAssets() };
    for (const locale of LOCALES) {
      const localized: Prerender = { ssr, assetsHtml: [prerender.assetsHtml, chunkPreload(locale)].filter(Boolean).join("\n    ") };
      writeMarkdownPages(localized, locale);
      writeDocsPages(localized, locale);
      writeHomePage(localized, locale);
      writeScriptOnlyPages(localized, locale);
    }
    writeGatewayPages(ssr.docPages);
  } finally {
    await vite.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
