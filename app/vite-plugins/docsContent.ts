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
  route: string;
  category?: string;
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

export interface StaticPage {
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
      const docPages: DocPage[] = [];
      const staticPages: Record<string, StaticPage[]> = {};

      for (const entry of manifest) {
        const pages = locales.map((locale) => {
          const isFallback = !entry.locales.includes(locale);
          const sourceLocale = isFallback ? defaultLocale : locale;
          const filePath = resolve(docsRoot, entry.slug, `${sourceLocale}.md`);
          const html = renderMarkdown(readFileSync(filePath, "utf-8"));
          const title = entry.title[locale] ?? entry.title[defaultLocale];
          return { locale, title, html, isFallback };
        });

        if (entry.route === "docs") {
          docPages.push(...pages.map((page) => ({ ...page, slug: entry.slug, category: entry.category! })));
        } else {
          staticPages[entry.route] = pages;
        }
        this.addWatchFile(resolve(docsRoot, entry.slug));
      }

      this.addWatchFile(manifestPath);
      const docCategories = [...new Set(manifest.filter((e) => e.route === "docs").map((e) => e.category!))];
      return `export const docPages = ${JSON.stringify(docPages)};\nexport const docCategories = ${JSON.stringify(docCategories)};\nexport const staticPages = ${JSON.stringify(staticPages)};`;
    },
  };
}
