import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { docsContentPlugin } from "./vite-plugins/docs/plugin";
import { createDocsSource } from "./vite-plugins/docs/content";
import { resolveSiteConfig } from "./src/config/site";
import { sitemapPlugin } from "./vite-plugins/sitemap";
import { mediaAliases } from "./vite-plugins/mediaAliases";
import { webManifestPlugin } from "./vite-plugins/webManifest";
import { MOBILE_MEDIA_QUERY } from "./src/config/breakpoints";
import { LOCALES, DEFAULT_LOCALE, LOCALE_META } from "./src/i18n/locales.config";
import { PAGE_IDS } from './src/router/router.pages';

const APP_DIR = dirname(fileURLToPath(import.meta.url));

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

function htmlLocaleGatePlugin() {
  return {
    name: "html-locale-gate",
    transformIndexHtml(html: string) {
      const alternateTags = [
        ...LOCALES.map((locale) => `    <link rel="alternate" hreflang="${locale}" href="./${locale}/" />`),
        `    <link rel="alternate" hreflang="x-default" href="./${DEFAULT_LOCALE}/" />`,
      ].join("\n");

      const languageLinks = LOCALES.map(
        (locale) => `          <a href="./${locale}/">${LOCALE_META[locale].label}</a>`
      ).join("\n");

      return html
        .replace(/(?:[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>\n?)+/, alternateTags + "\n")
        .replace(/<div class="language-options">[\s\S]*?<\/div>/, `<div class="language-options">\n${languageLinks}\n        </div>`);
    },
  };
}

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
    htmlLocaleGatePlugin(),
    docsContentPlugin(DOCS_SOURCE),
    sitemapPlugin(DOCS_SOURCE, SITE.siteUrl, LOCALES, DEFAULT_LOCALE, PAGE_IDS.filter((page) => page !== "history")),
    webManifestPlugin(LOCALES),
  ],
  css: { postcss: { plugins: [mediaAliases({ "--mobile": MOBILE_MEDIA_QUERY })] } },
  worker: { format: "es" },
  build: {
    target: "es2022",
    sourcemap: mode !== "production",
  },
}));
