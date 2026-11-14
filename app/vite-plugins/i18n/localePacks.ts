import type { Plugin } from "vite";
import { DEFAULT_LOCALE, LocaleCode } from "../../src/i18n/locales.config";
import { discoverLocales, readPackDictionary } from "./locales";

const PACKS_ID = "virtual:locale-packs";
const RESOLVED_PACKS_ID = `\0${PACKS_ID}`;
const PACK_DIR = "locales";

interface LocalePack {
  locale: LocaleCode;
  source: string;
  fileName: string;
}

export const packPath = (locale: LocaleCode): string => `${PACK_DIR}/${locale}.json`;

function collectPacks(): LocalePack[] {
  return discoverLocales()
    .filter((locale) => locale !== DEFAULT_LOCALE)
    .map((locale) => {
      const source = JSON.stringify(readPackDictionary(locale));
      return { locale, source, fileName: packPath(locale) };
    });
}

export function localePacksPlugin(): Plugin {
  let base = "/";

  return {
    name: "locale-packs",
    configResolved(config) {
      base = config.base;
    },
    resolveId: (id) => (id === PACKS_ID ? RESOLVED_PACKS_ID : undefined),
    load(id) {
      if (id !== RESOLVED_PACKS_ID) return undefined;
      const urls = Object.fromEntries(collectPacks().map(({ locale, fileName }) => [locale, `${base}${fileName}`]));
      return `export default ${JSON.stringify(urls)};`;
    },
    generateBundle() {
      for (const { fileName, source } of collectPacks()) this.emitFile({ type: "asset", fileName, source });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pack = collectPacks().find(({ locale }) => request.url?.split("?")[0] === `${base}${packPath(locale)}`);
        if (!pack) return next();
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        response.end(pack.source);
      });
    },
  };
}
