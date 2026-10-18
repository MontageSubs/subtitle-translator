import type { Plugin } from "vite";
import { buildWebManifest, manifestFileName } from "../src/config/webManifest";
import type { LocaleCode } from "../src/i18n/locales.config";
import { readLocaleText } from "./i18n/locales";

export function webManifestPlugin(locales: readonly LocaleCode[]): Plugin {
  let basePath = "/";
  return {
    name: "web-manifest",
    configResolved(config) {
      basePath = config.base;
    },
    generateBundle() {
      for (const locale of locales) {
        const text = {
          name: readLocaleText(locale, "brand.name"),
          short_name: readLocaleText(locale, "brand.name"),
          description: readLocaleText(locale, "pwa.description"),
        };
        this.emitFile({ type: "asset", fileName: manifestFileName(locale), source: JSON.stringify(buildWebManifest(locale, basePath, text)) });
      }
    },
  };
}
