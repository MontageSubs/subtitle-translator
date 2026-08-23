import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import obfuscator from "javascript-obfuscator";
import { docsContentPlugin } from "./vite-plugins/docsContent";
import { sitemapPlugin } from "./vite-plugins/sitemap";
import { LOCALES, DEFAULT_LOCALE } from "./src/i18n/locales.config";
import { PAGE_IDS } from "./src/router.pages";

const APP_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_PROBE_CHUNK = "env-probe";

function obfuscateEnvProbe() {
  return {
    name: "obfuscate-env-probe",
    generateBundle(_options: unknown, bundle: Record<string, { type: string; fileName: string; code?: string }>) {
      for (const file of Object.values(bundle)) {
        if (file.type === "chunk" && file.fileName.includes(ENV_PROBE_CHUNK) && file.code) {
          file.code = obfuscator.obfuscate(file.code, {
            compact: true,
            controlFlowFlattening: true,
            deadCodeInjection: true,
            stringArray: true,
            stringArrayEncoding: ["base64"],
            renameGlobals: false,
          }).getObfuscatedCode();
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [
    ...(mode === "production" ? [obfuscateEnvProbe()] : []),
    docsContentPlugin(resolve(APP_DIR, "../docs"), resolve(APP_DIR, ".."), LOCALES, DEFAULT_LOCALE),
    sitemapPlugin(resolve(APP_DIR, "../docs"), process.env.VITE_SITE_URL || "https://subs.js.org/subtitle-translator", LOCALES, PAGE_IDS.filter((page) => page !== "history")),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Subtitle Translator",
        short_name: "Subtitles",
        description: "Translate SRT subtitles in your browser — bilingual or monolingual output, powered by neural machine translation.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: process.env.VITE_BASE_PATH || "/",
        scope: process.env.VITE_BASE_PATH || "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,wasm}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: "es" },
  build: {
    target: "es2022",
    sourcemap: mode !== "production",
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("core/envProbe")) return ENV_PROBE_CHUNK;
        },
      },
    },
  },
}));
