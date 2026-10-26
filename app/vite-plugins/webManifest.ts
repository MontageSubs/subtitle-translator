import type { Plugin } from "vite";
import { buildWebManifest, manifestPath } from "../src/config/webManifest";
import { PRODUCTION_CHANNEL, type ChannelProfile } from "../src/config/channelProfile";
import type { LocaleCode } from "../src/i18n/locales.config";
import { readLocaleText } from "./i18n/locales";

export function webManifestPlugin(locales: readonly LocaleCode[], channel: ChannelProfile): Plugin {
  let basePath = "/";
  return {
    name: "web-manifest",
    configResolved(config) {
      basePath = config.base;
    },
    generateBundle() {
      for (const locale of locales) {
        const brand = channel.id === PRODUCTION_CHANNEL ? readLocaleText(locale, "brand.name") : `${readLocaleText(locale, "brand.name")} (${channel.id})`;
        const text = {
          name: brand,
          short_name: brand,
          description: readLocaleText(locale, "pwa.description"),
        };
        this.emitFile({ type: "asset", fileName: manifestPath(locale), source: JSON.stringify(buildWebManifest(locale, basePath, text)) });
      }
    },
  };
}
