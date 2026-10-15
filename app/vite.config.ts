import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { docsContentPlugin } from "./vite-plugins/docs/plugin";
import { createDocsSource } from "./vite-plugins/docs/content";
import { resolveSiteConfig } from "./src/config/site";
import { sitemapPlugin } from "./vite-plugins/sitemap";
import { mobileLayoutScope } from "./vite-plugins/mobileLayoutScope";
import { webManifestPlugin } from "./vite-plugins/webManifest";
import { htmlLocaleGatePlugin } from "./vite-plugins/i18n/htmlLocaleGate";
import { localeCatalogPlugin } from "./vite-plugins/i18n/localeCatalog";
import { discoverLocales } from "./vite-plugins/i18n/locales";
import { COMPACT_LAYOUT_SCOPE, MOBILE_MEDIA_QUERY } from "./src/config/breakpoints";
import { DEFAULT_LOCALE } from "./src/i18n/locales.config";
import { PAGE_IDS } from './src/router/router.pages';

const APP_DIR = dirname(fileURLToPath(import.meta.url));

const LOCALES = discoverLocales();

function readAppVersion(): string {
  const html = readFileSync(resolve(APP_DIR, "index.html"), "utf-8");
  return html.match(/<meta name="app-version" content="([^"]+)"/)?.[1] ?? "0.0.0";
}

const APP_VERSION = readAppVersion();
const BASE_PATH = process.env.VITE_BASE_PATH || "/";
const SITE = resolveSiteConfig(process.env);
const DOCS_SOURCE = createDocsSource({
  docsRoot: resolve(APP_DIR, "../docs"),
  repoRoot: resolve(APP_DIR, ".."),
  publicDir: resolve(APP_DIR, "public"),
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  basePath: BASE_PATH,
  site: SITE,
});

export default defineConfig(({ mode }) => ({
  root: APP_DIR,
  base: BASE_PATH,
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  plugins: [
    localeCatalogPlugin(),
    htmlLocaleGatePlugin(LOCALES),
    docsContentPlugin(DOCS_SOURCE),
    sitemapPlugin(DOCS_SOURCE, SITE.siteUrl, LOCALES, DEFAULT_LOCALE, PAGE_IDS.filter((page) => page !== "history")),
    webManifestPlugin(LOCALES),
  ],
  css: { postcss: { plugins: [mobileLayoutScope({ query: MOBILE_MEDIA_QUERY, scope: COMPACT_LAYOUT_SCOPE })] } },
  worker: { format: "es" },
  build: {
    target: "es2022",
    sourcemap: mode !== "production",
  },
}));
