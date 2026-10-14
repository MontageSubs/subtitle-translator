import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { buildWebManifest, manifestFileName, WebManifestText } from "../src/config/webManifest";
import type { LocaleCode } from "../src/i18n/locales.config";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(CURRENT_DIR, "../src/i18n/locales");

function readManifestText(locale: string): WebManifestText {
  const result: WebManifestText = {
    name: "Montage Subtitle Translator",
    short_name: "Montage Subtitle Translator",
    description: "Translate subtitle files in your browser with neural machine translation. Bilingual or translation-only output.",
  };
  try {
    const enDict = JSON.parse(readFileSync(resolve(LOCALES_DIR, "en.json"), "utf-8"));
    if (enDict["brand.name"]) result.name = enDict["brand.name"];
    if (enDict["pwa.shortName"]) result.short_name = enDict["pwa.shortName"];
    if (enDict["pwa.description"]) result.description = enDict["pwa.description"];
  } catch {}
  if (locale !== "en") {
    try {
      const locDict = JSON.parse(readFileSync(resolve(LOCALES_DIR, `${locale}.json`), "utf-8"));
      if (locDict["brand.name"]) result.name = locDict["brand.name"];
      if (locDict["pwa.shortName"]) result.short_name = locDict["pwa.shortName"];
      if (locDict["pwa.description"]) result.description = locDict["pwa.description"];
    } catch {}
  }
  return result;
}

export function webManifestPlugin(locales: readonly LocaleCode[]): Plugin {
  let basePath = "/";
  return {
    name: "web-manifest",
    configResolved(config) {
      basePath = config.base;
    },
    generateBundle() {
      for (const locale of locales) {
        const text = readManifestText(locale);
        this.emitFile({ type: "asset", fileName: manifestFileName(locale), source: JSON.stringify(buildWebManifest(locale, basePath, text)) });
      }
    },
  };
}
