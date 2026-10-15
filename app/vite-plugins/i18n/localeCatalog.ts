import { resolve } from "node:path";
import type { Plugin } from "vite";
import { LOCALES_DIR, discoverLocales, readLocaleText, readNativeName } from "./locales";

const CREDIT_KEY = "credit.text";
const CATALOG_ID = "virtual:locale-catalog";
const RESOLVED_CATALOG_ID = `\0${CATALOG_ID}`;

export function localeCatalogPlugin(): Plugin {
  return {
    name: "locale-catalog",
    resolveId: (id) => (id === CATALOG_ID ? RESOLVED_CATALOG_ID : undefined),
    load(id) {
      if (id !== RESOLVED_CATALOG_ID) return undefined;
      const locales = discoverLocales();
      const names = Object.fromEntries(locales.map((locale) => [locale, readNativeName(locale)]));
      const credits = Object.fromEntries(locales.flatMap((locale) => {
        const text = readLocaleText(locale, CREDIT_KEY);
        return text ? [[locale, text]] : [];
      }));
      return [
        `export const LOCALES = ${JSON.stringify(locales)};`,
        `export const LOCALE_NATIVE_NAMES = ${JSON.stringify(names)};`,
        `export const LOCALE_CREDIT_TEXTS = ${JSON.stringify(credits)};`,
      ].join("\n");
    },
    configureServer(server) {
      const reloadCatalog = (file: string) => {
        if (!file.startsWith(resolve(LOCALES_DIR))) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_CATALOG_ID);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", reloadCatalog).on("unlink", reloadCatalog).on("change", reloadCatalog);
    },
  };
}
