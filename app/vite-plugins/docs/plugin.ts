import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import type { DocsSource } from "./content";
import { getEmittedAssets } from "./gitMeta";

const VIRTUAL_ID = "virtual:docs-content";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

export function docsContentPlugin(source: DocsSource): Plugin {
  return {
    name: "docs-content",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },
    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return;
      const { docPages, staticPages } = await source.load((path) => this.addWatchFile(path));
      return `export const docPages = ${JSON.stringify(docPages)};\nexport const staticPages = ${JSON.stringify(staticPages)};`;
    },
    generateBundle() {
      for (const { relPath, absPath } of getEmittedAssets()) {
        this.emitFile({ type: "asset", fileName: relPath, source: readFileSync(absPath) });
      }
    },
  };
}
