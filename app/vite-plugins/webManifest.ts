import type { Plugin } from "vite";
import { buildWebManifest, manifestFileName } from "../src/config/webManifest";
import type { LocaleCode } from "../src/i18n/locales.config";

export function webManifestPlugin(locales: readonly LocaleCode[]): Plugin {
  let basePath = "/";
  return {
    name: "web-manifest",
    configResolved(config) {
      basePath = config.base;
    },
    generateBundle() {
      for (const locale of locales) {
        this.emitFile({ type: "asset", fileName: manifestFileName(locale), source: JSON.stringify(buildWebManifest(locale, basePath)) });
      }
    },
  };
}
