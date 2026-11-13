import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { withShells, type DocsSource } from "./content";
import { ANNOUNCEMENT_INDEX_FILE, announcementBodyFile } from "../../src/config/announcement";
import type { AnnouncementIndex } from "../../src/types/docs";
import { getEmittedAssets } from "./gitMeta";

import { DOCS_CHUNK_PREFIX, DOCS_LOADERS_ID, DOCS_LOCALE_PREFIX } from "../../src/config/docsModules";
import type { LocaleCode } from "../../src/i18n/locales.config";

const VIRTUAL_ID = "virtual:docs-content";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;
const RESOLVED_LOADERS_ID = `\0${DOCS_LOADERS_ID}`;
const RESOLVED_LOCALE_PREFIX = `\0${DOCS_LOCALE_PREFIX}`;

export const docsChunkOf = (id: string): string | undefined => (id.startsWith(RESOLVED_LOCALE_PREFIX) ? `${DOCS_CHUNK_PREFIX}${id.slice(RESOLVED_LOCALE_PREFIX.length)}` : undefined);

export function docsContentPlugin(source: DocsSource, locales: readonly LocaleCode[]): Plugin {
  return {
    name: "docs-content",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      if (id === DOCS_LOADERS_ID) return RESOLVED_LOADERS_ID;
      if (id.startsWith(DOCS_LOCALE_PREFIX) && locales.includes(id.slice(DOCS_LOCALE_PREFIX.length) as LocaleCode)) return `\0${id}`;
    },
    async load(id, options) {
      if (id === RESOLVED_LOADERS_ID) {
        const entries = locales.map((locale) => `${JSON.stringify(locale)}: () => import(${JSON.stringify(`${DOCS_LOCALE_PREFIX}${locale}`)})`);
        return `export default { ${entries.join(", ")} };`;
      }
      if (id.startsWith(RESOLVED_LOCALE_PREFIX)) {
        const locale = id.slice(RESOLVED_LOCALE_PREFIX.length);
        const { docPages, staticPages } = await source.load((path) => this.addWatchFile(path));
        const ownStatic = Object.fromEntries(Object.entries(staticPages).map(([page, entries]) => [page, entries.filter((entry) => entry.locale === locale)]));
        return `export const docPages = ${JSON.stringify(withShells(docPages.filter((page) => page.locale === locale)))};\nexport const staticPages = ${JSON.stringify(ownStatic)};`;
      }
      if (id !== RESOLVED_VIRTUAL_ID) return;
      const { docPages, staticPages } = await source.load((path) => this.addWatchFile(path));
      return `export const docPages = ${JSON.stringify(options?.ssr ? docPages : withShells(docPages))};\nexport const staticPages = ${JSON.stringify(staticPages)};`;
    },
    async generateBundle() {
      for (const { relPath, absPath } of getEmittedAssets()) {
        this.emitFile({ type: "asset", fileName: relPath, source: readFileSync(absPath) });
      }
      const { announcements } = await source.current();
      for (const announcement of announcements) {
        this.emitFile({ type: "asset", fileName: announcementBodyFile(announcement.locale, announcement.rev), source: JSON.stringify(announcement) });
      }
      const index: AnnouncementIndex = { entries: announcements.map(({ locale, rev, title, bannerId, banner }) => ({ locale, rev, title, bannerId, banner })) };
      this.emitFile({ type: "asset", fileName: ANNOUNCEMENT_INDEX_FILE, source: JSON.stringify(index) });
    },
  };
}
