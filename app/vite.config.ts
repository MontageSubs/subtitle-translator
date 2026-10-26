import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { browserProfile, resolveBuildChannel } from "./vite-plugins/channel";
import { notFoundPagePlugin } from "./vite-plugins/notFoundPage";
import { robotsMetaPlugin } from "./vite-plugins/robotsMeta";
import { serviceWorkerPlugin } from "./vite-plugins/serviceWorker/plugin";
import { docsContentPlugin } from "./vite-plugins/docs/plugin";
import { createDocsSource } from "./vite-plugins/docs/content";
import { resolveSiteConfig } from "./src/config/site";
import { searchVerificationPlugin } from "./vite-plugins/searchVerification";
import { sitemapPlugin } from "./vite-plugins/sitemap";
import { mobileLayoutScope } from "./vite-plugins/mobileLayoutScope";
import { webManifestPlugin } from "./vite-plugins/webManifest";
import { htmlLocaleGatePlugin } from "./vite-plugins/i18n/htmlLocaleGate";
import { localeCatalogPlugin } from "./vite-plugins/i18n/localeCatalog";
import { localePacksPlugin } from "./vite-plugins/i18n/localePacks";
import { discoverLocales } from "./vite-plugins/i18n/locales";
import { COMPACT_LAYOUT_SCOPE, MOBILE_MEDIA_QUERY } from "./src/config/breakpoints";
import { DEFAULT_LOCALE } from "./src/i18n/locales.config";
import { PAGE_IDS } from './src/router/router.pages';

const APP_DIR = dirname(fileURLToPath(import.meta.url));

const LOCALES = discoverLocales();

const CHANNEL = resolveBuildChannel(process.env);
const BASE_PATH = CHANNEL.basePath;
const SITE = resolveSiteConfig(process.env, CHANNEL.id);
const DOCS_SOURCE = createDocsSource({
  docsRoot: resolve(APP_DIR, "../docs"),
  repoRoot: resolve(APP_DIR, ".."),
  assetCacheDir: resolve(APP_DIR, "node_modules/.cache/docs-assets"),
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  basePath: BASE_PATH,
  site: SITE,
});

export default defineConfig(({ mode }) => ({
  root: APP_DIR,
  base: BASE_PATH,
  define: {
    __APP_VERSION__: JSON.stringify(CHANNEL.version),
    __APP_CHANNEL__: JSON.stringify(browserProfile(CHANNEL)),
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  plugins: [
    localeCatalogPlugin(),
    localePacksPlugin(),
    htmlLocaleGatePlugin(LOCALES, CHANNEL),
    robotsMetaPlugin(CHANNEL),
    searchVerificationPlugin(loadEnv(mode, APP_DIR, "VITE_")),
    docsContentPlugin(DOCS_SOURCE),
    sitemapPlugin(DOCS_SOURCE, SITE.siteUrl, LOCALES, DEFAULT_LOCALE, PAGE_IDS.filter((page) => page !== "history"), CHANNEL.indexable),
    webManifestPlugin(LOCALES, CHANNEL),
    serviceWorkerPlugin(CHANNEL),
    notFoundPagePlugin(CHANNEL),
  ],
  css: { postcss: { plugins: [mobileLayoutScope({ query: MOBILE_MEDIA_QUERY, scope: COMPACT_LAYOUT_SCOPE })] } },
  worker: { format: "es" },
  build: {
    outDir: CHANNEL.outDir,
    target: "es2022",
    sourcemap: mode !== "production",
  },
}));
