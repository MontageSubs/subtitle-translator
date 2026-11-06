import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { withShells, type DocsSource } from "./content";
import { ANNOUNCEMENT_INDEX_FILE, announcementBodyFile } from "../../src/config/announcement";
import type { AnnouncementIndex } from "../../src/types/docs";
import { getEmittedAssets } from "./gitMeta";

const VIRTUAL_ID = "virtual:docs-content";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

export function docsContentPlugin(source: DocsSource): Plugin {
  return {
    name: "docs-content",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },
    async load(id, options) {
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
