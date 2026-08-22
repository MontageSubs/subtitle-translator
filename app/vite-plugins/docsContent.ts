import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeStringify from "rehype-stringify";
import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:docs-content";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

interface ManifestEntry {
  slug: string;
  category: string;
  title: Record<string, string>;
  locales: string[];
}

export interface DocPage {
  slug: string;
  category: string;
  locale: string;
  title: string;
  html: string;
  isFallback: boolean;
}

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypeAutolinkHeadings, { behavior: "wrap" })
  .use(rehypeStringify);

function renderMarkdown(markdown: string): string {
  return String(markdownProcessor.processSync(markdown));
}

export function docsContentPlugin(docsRoot: string, locales: readonly string[], defaultLocale: string): Plugin {
  return {
    name: "docs-content",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return;
      const manifestPath = resolve(docsRoot, "manifest.yml");
      const manifest = load(readFileSync(manifestPath, "utf-8")) as ManifestEntry[];
      const pages: DocPage[] = [];

      for (const entry of manifest) {
        for (const locale of locales) {
          const isFallback = !entry.locales.includes(locale);
          const sourceLocale = isFallback ? defaultLocale : locale;
          const filePath = resolve(docsRoot, entry.slug, `${sourceLocale}.md`);
          const html = renderMarkdown(readFileSync(filePath, "utf-8"));
          const title = entry.title[locale] ?? entry.title[defaultLocale];
          pages.push({ slug: entry.slug, category: entry.category, locale, title, html, isFallback });
        }
        this.addWatchFile(resolve(docsRoot, entry.slug));
      }

      this.addWatchFile(manifestPath);
      return `export const docPages = ${JSON.stringify(pages)};\nexport const docCategories = ${JSON.stringify([...new Set(manifest.map((e) => e.category))])};`;
    },
  };
}
