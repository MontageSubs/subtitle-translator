import type { Plugin } from "vite";
import { buildWebManifest, manifestPath } from "../src/config/webManifest";
import { PRODUCTION_CHANNEL, type ChannelProfile } from "../src/config/channelProfile";
import type { LocaleCode } from "../src/i18n/locales.config";
import { readLocaleText, readMetadataText } from "./i18n/locales";

export function webManifestPlugin(locales: readonly LocaleCode[], channel: ChannelProfile): Plugin {
  let basePath = "/";
  const labelOf = (label: string): string => (channel.id === PRODUCTION_CHANNEL ? label : `${label} (${channel.id})`);
  return {
    name: "web-manifest",
    configResolved(config) {
      basePath = config.base;
    },
    generateBundle() {
      for (const locale of locales) {
        const brand = readLocaleText(locale, "app.brand") ?? "";
        const text = {
          name: labelOf(brand),
          short_name: labelOf(readMetadataText(locale, "app.shortName") ?? brand),
          description: readMetadataText(locale, "app.description"),
        };
        this.emitFile({ type: "asset", fileName: manifestPath(locale), source: JSON.stringify(buildWebManifest(locale, basePath, text)) });
      }
    },
  };
}
