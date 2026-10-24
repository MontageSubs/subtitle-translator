import { createHash } from "node:crypto";
import type { Plugin } from "vite";
import { DEFAULT_LOCALE, LocaleCode } from "../../src/i18n/locales.config";
import { discoverLocales, readLocaleDictionary } from "./locales";

const PACKS_ID = "virtual:locale-packs";
const RESOLVED_PACKS_ID = `\0${PACKS_ID}`;
const PACK_DIR = "locales";
const HASH_LENGTH = 8;

interface LocalePack {
  locale: LocaleCode;
  source: string;
  fileName: string;
}

function collectPacks(): LocalePack[] {
  return discoverLocales()
    .filter((locale) => locale !== DEFAULT_LOCALE)
    .map((locale) => {
      const source = JSON.stringify(readLocaleDictionary(locale));
      const hash = createHash("sha256").update(source).digest("hex").slice(0, HASH_LENGTH);
      return { locale, source, fileName: `${PACK_DIR}/${locale}.${hash}.json` };
    });
}

export function localePacksPlugin(): Plugin {
  let base = "/";
  let serving = false;
  const devRoute = (locale: LocaleCode): string => `${PACK_DIR}/${locale}.json`;

  return {
    name: "locale-packs",
    configResolved(config) {
      base = config.base;
      serving = config.command === "serve";
    },
    resolveId: (id) => (id === PACKS_ID ? RESOLVED_PACKS_ID : undefined),
    load(id) {
      if (id !== RESOLVED_PACKS_ID) return undefined;
      const urls = Object.fromEntries(collectPacks().map(({ locale, fileName }) => [locale, `${base}${serving ? devRoute(locale) : fileName}`]));
      return `export default ${JSON.stringify(urls)};`;
    },
    generateBundle() {
      for (const { fileName, source } of collectPacks()) this.emitFile({ type: "asset", fileName, source });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pack = collectPacks().find(({ locale }) => request.url?.split("?")[0] === `${base}${devRoute(locale)}`);
        if (!pack) return next();
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        response.end(pack.source);
      });
    },
  };
}
