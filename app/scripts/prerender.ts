import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { resolveSiteConfig } from "../src/config/site";
import { DEFAULT_LOCALE, LOCALES, LOCALE_STORAGE_KEY, LocaleCode } from "../src/i18n/locales.config";
import { HOME_PAGE_ID } from "../src/render/paths";
import type { DocPage } from "../src/types/docs";
import { renderLanguageGatewayPage, renderLegacyRedirectPage } from "./prerenderTemplates";

type SsrEntry = typeof import("../src/render/ssrEntry");

interface Prerender {
  ssr: SsrEntry;
  assetsHtml: string;
}

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = resolve(APP_DIR, "dist");
const BASE_PATH = process.env.VITE_BASE_PATH || "/";
const SITE_URL = resolveSiteConfig(process.env).siteUrl;

const HOME_PAGE_CHUNK = "translatorPage";
const LEGACY_HOME_SEGMENT = "nmt";
const MARKDOWN_PAGES = ["about", "apps", "contribute"] as const;
const NON_SCRIPT_PAGES: ReadonlySet<string> = new Set(["docs", HOME_PAGE_ID, ...MARKDOWN_PAGES]);
const LEGACY_GATEWAY_SEGMENTS = [...MARKDOWN_PAGES, "history", "discussions", LEGACY_HOME_SEGMENT];

function extractBuiltAssets(): string {
  const html = readFileSync(resolve(DIST_DIR, "index.html"), "utf-8");
  const tags = html.match(/<link[^>]+rel="(?:stylesheet|modulepreload)"[^>]*>|<script[^>]+src="[^"]+"[^>]*><\/script>/g) ?? [];
  return tags.join("\n    ");
}

function chunkPreload(chunkName: string): string {
  const chunk = readdirSync(resolve(DIST_DIR, "assets")).find((name) => new RegExp(`^${chunkName}-[\\w-]+\\.js$`).test(name));
  return chunk ? `<link rel="modulepreload" crossorigin href="${BASE_PATH.replace(/\/?$/, "/")}assets/${chunk}">` : "";
}

function writePage(routeSegments: string[], html: string): void {
  const outDir = resolve(DIST_DIR, ...routeSegments);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "index.html"), html);
}

function writeMarkdownPages({ ssr, assetsHtml }: Prerender, locale: LocaleCode): void {
  for (const page of MARKDOWN_PAGES) {
    const content = ssr.staticPages[page].find((candidate) => candidate.locale === locale);
    const body = ssr.renderStaticPageBody(locale, content, `page.${page}.placeholder` as const);
    const meta = { title: ssr.translate(locale, ssr.TITLE_KEYS[page]), description: ssr.translate(locale, ssr.DESCRIPTION_KEYS[page]), routeSegments: [page] };
    writePage([locale, page], ssr.renderDocument({ locale, page, basePath: BASE_PATH }, meta, body, assetsHtml, SITE_URL));
  }
}

function writeDocsPages({ ssr, assetsHtml }: Prerender, locale: LocaleCode): void {
  const pages = ssr.docPages.filter((page) => page.locale === locale);
  const listMeta = { title: ssr.translate(locale, ssr.TITLE_KEYS.docs), description: ssr.translate(locale, ssr.DESCRIPTION_KEYS.docs), routeSegments: ["docs"] };
  writePage([locale, "docs"], ssr.renderDocument({ locale, page: "docs", basePath: BASE_PATH }, listMeta, ssr.renderDocsListBody(locale, BASE_PATH, pages, "newest"), assetsHtml, SITE_URL));

  for (const page of pages) {
    const meta = { title: page.title, description: ssr.translate(locale, "meta.docs.description"), routeSegments: ["docs", page.slug] };
    const context = { locale, page: "docs" as const, basePath: BASE_PATH, rest: [page.slug] };
    writePage([locale, "docs", page.slug], ssr.renderDocument(context, meta, ssr.renderDocsDetailBody(locale, BASE_PATH, page), assetsHtml, SITE_URL));
  }
}

function writeHomePage({ ssr, assetsHtml }: Prerender, locale: LocaleCode): void {
  const meta = { title: ssr.translate(locale, ssr.TITLE_KEYS[HOME_PAGE_ID]), description: ssr.translate(locale, ssr.DESCRIPTION_KEYS[HOME_PAGE_ID]), routeSegments: [] };
  const assets = `${assetsHtml}\n    ${chunkPreload(HOME_PAGE_CHUNK)}`;
  writePage([locale], ssr.renderDocument({ locale, page: HOME_PAGE_ID, basePath: BASE_PATH }, meta, ssr.renderJsRequiredBody(locale, HOME_PAGE_ID), assets, SITE_URL));
  writePage([locale, LEGACY_HOME_SEGMENT], renderLegacyRedirectPage({ locale, brand: ssr.translate(locale, "brand.name"), siteUrl: SITE_URL, basePath: BASE_PATH }));
}

function writeScriptOnlyPages({ ssr, assetsHtml }: Prerender, locale: LocaleCode): void {
  for (const page of ssr.PAGE_IDS.filter((candidate) => !NON_SCRIPT_PAGES.has(candidate))) {
    const meta = { title: ssr.translate(locale, ssr.TITLE_KEYS[page]), description: ssr.translate(locale, ssr.DESCRIPTION_KEYS[page]), routeSegments: [page], noindex: page === "history" };
    writePage([locale, page], ssr.renderDocument({ locale, page, basePath: BASE_PATH }, meta, ssr.renderJsRequiredBody(locale, page), assetsHtml, SITE_URL));
  }
}

function writeGatewayPages(docPages: DocPage[]): void {
  const gateway = (subPath: string) => renderLanguageGatewayPage({ basePath: BASE_PATH, subPath, locales: LOCALES, defaultLocale: DEFAULT_LOCALE, storageKey: LOCALE_STORAGE_KEY });
  for (const segment of LEGACY_GATEWAY_SEGMENTS) writePage([segment], gateway(`${segment}/`));
  writePage(["docs"], gateway("docs/"));
  for (const slug of new Set(docPages.map((page) => page.slug))) writePage(["docs", slug], gateway(`docs/${slug}/`));
}

async function main(): Promise<void> {
  const vite = await createServer({ root: APP_DIR, server: { middlewareMode: true }, appType: "custom" });
  try {
    const ssr = (await vite.ssrLoadModule("/src/render/ssrEntry.ts")) as SsrEntry;
    const prerender: Prerender = { ssr, assetsHtml: extractBuiltAssets() };
    for (const locale of LOCALES) {
      writeMarkdownPages(prerender, locale);
      writeDocsPages(prerender, locale);
      writeHomePage(prerender, locale);
      writeScriptOnlyPages(prerender, locale);
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
