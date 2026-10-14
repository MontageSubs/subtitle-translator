import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { defineConfig } from "vite";
import { docsContentPlugin } from "./vite-plugins/docs/plugin";
import { createDocsSource } from "./vite-plugins/docs/content";
import { resolveSiteConfig } from "./src/config/site";
import { sitemapPlugin } from "./vite-plugins/sitemap";
import { mobileLayoutScope } from "./vite-plugins/mobileLayoutScope";
import { webManifestPlugin } from "./vite-plugins/webManifest";
import { COMPACT_LAYOUT_SCOPE, MOBILE_MEDIA_QUERY } from "./src/config/breakpoints";
import { DEFAULT_LOCALE } from "./src/i18n/locales.config";
import { PAGE_IDS } from './src/router/router.pages';

const APP_DIR = dirname(fileURLToPath(import.meta.url));

function discoverLocales(): string[] {
  const localesDir = resolve(APP_DIR, "src/i18n/locales");
  return readdirSync(localesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""));
}

const LOCALES = discoverLocales();

function readNativeName(locale: string): string {
  const jsonPath = resolve(APP_DIR, "src/i18n/locales", `${locale}.json`);
  try {
    const dict = JSON.parse(readFileSync(jsonPath, "utf-8"));
    const key = `language.name.${locale}`;
    if (dict[key]) return dict[key];
  } catch {}
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(locale);
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {}
  return locale;
}

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
      const siteUrl = (process.env.VITE_SITE_URL || "").replace(/\/$/, "");
      const hrefFor = (locale: string) => (siteUrl ? `${siteUrl}/${locale}/` : `./${locale}/`);
      const alternateTags = [
        ...LOCALES.map((locale) => `    <link rel="alternate" hreflang="${locale}" href="${hrefFor(locale)}" />`),
        `    <link rel="alternate" hreflang="x-default" href="${hrefFor(DEFAULT_LOCALE)}" />`,
      ].join("\n");

      const languageLinks = LOCALES.map(
        (locale) => `          <a href="./${locale}/" lang="${locale}" hreflang="${locale}">${readNativeName(locale)}</a>`
      ).join("\n");

      const supportedJson = JSON.stringify(LOCALES);
      const scriptReplacement = `var supported = ${supportedJson};
        if (supported.indexOf(firstSeg) !== -1) return;
        try {
          if (sessionStorage.getItem(GATE_FLAG)) return;
          sessionStorage.setItem(GATE_FLAG, "1");
        } catch (e) {}
        var target = null;
        try {
          var saved = localStorage.getItem("subtitle-translator:locale");
          if (supported.indexOf(saved) !== -1) target = saved;
        } catch (e) {}
        if (!target) {
          var userLangs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "${DEFAULT_LOCALE}"];
          for (var i = 0; i < userLangs.length; i++) {
            var raw = (userLangs[i] || "").split(";")[0].trim().replace(/_/g, "-");
            if (!raw) continue;
            var exact = supported.find(function (s) { return s.toLowerCase() === raw.toLowerCase(); });
            if (exact) { target = exact; break; }
            var parts = raw.split("-");
            var lang = parts[0].toLowerCase();
            if (lang === "zh") {
              var isTrad = raw.indexOf("Hant") !== -1 || parts.indexOf("TW") !== -1 || parts.indexOf("HK") !== -1 || parts.indexOf("MO") !== -1 || /cht|traditional/i.test(raw);
              var prefZh = isTrad ? "zh-Hant" : "zh-Hans";
              var altZh = isTrad ? "zh-Hans" : "zh-Hant";
              var matchedZh = supported.find(function (s) { return s.toLowerCase() === prefZh.toLowerCase(); })
                || supported.find(function (s) { return s.toLowerCase() === altZh.toLowerCase(); });
              if (matchedZh) { target = matchedZh; break; }
            }
            var prefix = supported.find(function (s) {
              var sLow = s.toLowerCase();
              var rLow = raw.toLowerCase();
              return rLow.indexOf(sLow + "-") === 0 || sLow.indexOf(rLow + "-") === 0 || sLow === lang;
            });
            if (prefix) { target = prefix; break; }
          }
        }
        if (!target) target = "${DEFAULT_LOCALE}";`;

      return html
        .replace(/(?:[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>\n?)+/, alternateTags + "\n")
        .replace(/<div class="language-options">[\s\S]*?<\/div>/, `<div class="language-options">\n${languageLinks}\n        </div>`)
        .replace(/if \(firstSeg === "en"[\s\S]*?target = "en";[\s\S]*?}/, scriptReplacement);
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
  css: { postcss: { plugins: [mobileLayoutScope({ query: MOBILE_MEDIA_QUERY, scope: COMPACT_LAYOUT_SCOPE })] } },
  worker: { format: "es" },
  build: {
    target: "es2022",
    sourcemap: mode !== "production",
  },
}));
