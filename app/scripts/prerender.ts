import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { storageKeyOf } from "../src/config/channelProfile";
import type { CrawlRestriction } from "../src/config/crawlPolicy";
import { resolveSiteConfig } from "../src/config/site";
import { DEFAULT_LOCALE, LocaleCode } from "../src/i18n/locales.config";
import { HOME_PAGE_ID } from "../src/render/paths";
import { renderLanguageGatewayPage } from "./prerenderTemplates";
import { resolveBuildChannel } from "../vite-plugins/channel";
import { discoverLocales, readNativeName } from "../vite-plugins/i18n/locales";

type SsrEntry = typeof import("../src/render/ssrEntry");

interface Prerender {
  ssr: SsrEntry;
  assetsHtml: string;
}

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const CHANNEL = resolveBuildChannel(process.env);
const DIST_DIR = resolve(APP_DIR, CHANNEL.outDir);
const BASE_PATH = CHANNEL.basePath;
const SITE_URL = resolveSiteConfig(process.env, CHANNEL.id).siteUrl;

const LOCALES = discoverLocales();

const HOME_PAGE_CHUNK = "translatorPage";
const MARKDOWN_PAGES = ["about", "tools", "contribute"] as const;
const NON_SCRIPT_PAGES: ReadonlySet<string> = new Set(["docs", HOME_PAGE_ID, ...MARKDOWN_PAGES]);
const GATEWAY_SEGMENTS = [...MARKDOWN_PAGES, "history", "models", "discussions"];

const ASSET_TAG_ORDER = [/rel="stylesheet"/, /rel="modulepreload"/, /<script/];
const STATIC_IMPORT_PATTERN = /(?:from|import)\s*"\.\/([\w.-]+\.js)"/g;

function extractBuiltAssets(): string {
  const html = readFileSync(resolve(DIST_DIR, "index.html"), "utf-8");
  const tags = html.match(/<link[^>]+rel="(?:stylesheet|modulepreload)"[^>]*>|<script[^>]+src="[^"]+"[^>]*><\/script>/g) ?? [];
  const rank = (tag: string): number => ASSET_TAG_ORDER.findIndex((pattern) => pattern.test(tag));
  return [...tags].sort((a, b) => rank(a) - rank(b)).join("\n    ");
}

function staticDependenciesOf(chunk: string, seen: Set<string>): void {
  if (seen.has(chunk)) return;
  seen.add(chunk);
  const source = readFileSync(resolve(DIST_DIR, "assets", chunk), "utf-8");
  for (const [, dependency] of source.matchAll(STATIC_IMPORT_PATTERN)) staticDependenciesOf(dependency, seen);
}

function chunkPreload(chunkName: string): string {
  const chunk = readdirSync(resolve(DIST_DIR, "assets")).find((name) => new RegExp(`^${chunkName}-[\\w-]{8}\\.js$`).test(name));
  if (!chunk) return "";
  const chunks = new Set<string>();
  staticDependenciesOf(chunk, chunks);
  const base = BASE_PATH.replace(/\/?$/, "/");
  return [...chunks].map((name) => `<link rel="modulepreload" crossorigin href="${base}assets/${name}">`).join("\n    ");
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
    const meta = {
      title: ssr.translate(locale, ssr.DOCUMENT_TITLE_KEYS[page]),
      description: ssr.translate(locale, ssr.DESCRIPTION_KEYS[page]),
      keywords: ssr.translate(locale, ssr.KEYWORD_KEYS[page]),
      routeSegments: [page],
      restrictions: content?.restrictions,
      translatedLocales: ssr.translatedLocales(ssr.staticPages[page], LOCALES),
      article: { publishedTime: content?.createdAt, modifiedTime: content?.updatedAt },
      jsonLd: content ? ssr.buildDocStructuredData(SITE_URL, `${SITE_URL}/${content.sourceLocale}/${page}/`, { ...content, route: page }) : undefined,
    };
    writePage([locale, page], ssr.renderDocument({ locale, page, basePath: BASE_PATH }, meta, body, assetsHtml, SITE_URL));
  }
}

function writeDocsPages({ ssr, assetsHtml }: Prerender, locale: LocaleCode): void {
  const pages = ssr.docPages.filter((page) => page.locale === locale);
  const fallbackPages = pages.length > 0 ? pages : ssr.docPages.filter((page) => page.locale === DEFAULT_LOCALE);
  const listMeta = { title: ssr.translate(locale, ssr.DOCUMENT_TITLE_KEYS.docs), description: ssr.translate(locale, ssr.DESCRIPTION_KEYS.docs), keywords: ssr.translate(locale, ssr.KEYWORD_KEYS.docs), routeSegments: ["docs"], translatedLocales: ssr.translatedLocales(ssr.docPages, LOCALES) };
  writePage([locale, "docs"], ssr.renderDocument({ locale, page: "docs", basePath: BASE_PATH }, listMeta, ssr.renderDocsListBody(locale, BASE_PATH, fallbackPages, "newest"), assetsHtml, SITE_URL));

  for (const page of fallbackPages) {
    const ownRoute = page.route && page.route !== "docs" ? page.route : undefined;
    const canonicalSegments = ownRoute ? [ownRoute] : ["docs", page.slug];
    const meta = {
      title: page.title,
      description: page.summary || ssr.translate(locale, "meta.docs.description"),
      routeSegments: ["docs", page.slug],
      restrictions: page.restrictions,
      keywords: ssr.translate(locale, ssr.keywordKeyOfRoute(ownRoute)),
      canonicalRouteSegments: canonicalSegments,
      translatedLocales: ssr.translatedLocales(ssr.docPages.filter((candidate) => candidate.slug === page.slug), LOCALES),
      article: { publishedTime: page.createdAt, modifiedTime: page.updatedAt },
      jsonLd: ownRoute ? undefined : ssr.buildDocStructuredData(SITE_URL, `${SITE_URL}/${[page.sourceLocale, ...canonicalSegments].join("/")}/`, page),
    };
    const context = { locale, page: "docs" as const, basePath: BASE_PATH, rest: [page.slug] };
    writePage([locale, "docs", page.slug], ssr.renderDocument(context, meta, ssr.renderDocsDetailBody(locale, BASE_PATH, page), assetsHtml, SITE_URL));
  }
}

function writeHomePage({ ssr, assetsHtml }: Prerender, locale: LocaleCode): void {
  const meta = { title: ssr.translate(locale, ssr.DOCUMENT_TITLE_KEYS[HOME_PAGE_ID]), description: ssr.translate(locale, ssr.DESCRIPTION_KEYS[HOME_PAGE_ID]), keywords: ssr.translate(locale, ssr.KEYWORD_KEYS[HOME_PAGE_ID]), routeSegments: [], translatedLocales: LOCALES, jsonLd: ssr.buildTranslatorStructuredData(locale, SITE_URL) };
  const assets = `${assetsHtml}\n    ${chunkPreload(HOME_PAGE_CHUNK)}`;
  writePage([locale], ssr.renderDocument({ locale, page: HOME_PAGE_ID, basePath: BASE_PATH }, meta, ssr.renderJsRequiredBody(locale, HOME_PAGE_ID), assets, SITE_URL));
}

function writeScriptOnlyPages({ ssr, assetsHtml }: Prerender, locale: LocaleCode): void {
  for (const page of ssr.PAGE_IDS.filter((candidate) => !NON_SCRIPT_PAGES.has(candidate))) {
    const meta = { title: ssr.translate(locale, ssr.DOCUMENT_TITLE_KEYS[page]), description: ssr.translate(locale, ssr.DESCRIPTION_KEYS[page]), routeSegments: [page], translatedLocales: LOCALES, keywords: ssr.translate(locale, ssr.KEYWORD_KEYS[page]), restrictions: ssr.PAGE_CRAWL_RESTRICTIONS[page] };
    writePage([locale, page], ssr.renderDocument({ locale, page, basePath: BASE_PATH }, meta, ssr.renderJsRequiredBody(locale, page), assetsHtml, SITE_URL));
  }
}

function writeGatewayPages({ ssr }: Prerender): void {
  const localeNames = Object.fromEntries(LOCALES.map((loc) => [loc, readNativeName(loc)]));
  const brand = ssr.translate(DEFAULT_LOCALE, "app.brand");
  const gateway = (subPath: string, canonicalSubPath = subPath, restrictions: readonly CrawlRestriction[] = []) =>
    renderLanguageGatewayPage({ basePath: BASE_PATH, siteUrl: SITE_URL, subPath, canonicalSubPath, brand, locales: LOCALES, defaultLocale: DEFAULT_LOCALE, storageKey: storageKeyOf(CHANNEL, "locale"), indexable: CHANNEL.indexable, restrictions, localeNames });
  for (const segment of GATEWAY_SEGMENTS) {
    const restrictions = ssr.staticPages[segment]?.find((page) => page.locale === DEFAULT_LOCALE)?.restrictions ?? ssr.PAGE_CRAWL_RESTRICTIONS[segment];
    writePage([segment], gateway(`${segment}/`, `${segment}/`, restrictions));
  }
  writePage(["docs"], gateway("docs/"));
  for (const slug of new Set(ssr.docPages.map((page) => page.slug))) {
    const source = ssr.docPages.find((page) => page.slug === slug && page.locale === DEFAULT_LOCALE);
    const route = source?.route;
    writePage(["docs", slug], gateway(`docs/${slug}/`, route && route !== "docs" ? `${route}/` : `docs/${slug}/`, source?.restrictions));
  }
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
    writeGatewayPages(prerender);
  } finally {
    await vite.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
