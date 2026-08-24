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
import { resolveDocGitMeta, DocAuthor } from "./docsGitMeta";

const VIRTUAL_ID = "virtual:docs-content";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

interface ManifestEntry {
  slug: string;
  route: string;
  category?: string;
  pinned?: boolean;
  title: Record<string, string>;
  locales: string[];
}

interface PageBase {
  locale: string;
  sourceLocale: string;
  title: string;
  html: string;
  isFallback: boolean;
  pinned: boolean;
  authors: DocAuthor[];
  createdAt: string;
  updatedAt: string;
}

export interface DocPage extends PageBase {
  slug: string;
  category: string;
}

export type StaticPage = PageBase;

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

export function docsContentPlugin(docsRoot: string, repoRoot: string, locales: readonly string[], defaultLocale: string): Plugin {
  return {
    name: "docs-content",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },
    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return;
      const manifestPath = resolve(docsRoot, "manifest.yml");
      const manifest = load(readFileSync(manifestPath, "utf-8")) as ManifestEntry[];
      const docPages: DocPage[] = [];
      const staticPages: Record<string, StaticPage[]> = {};

      for (const entry of manifest) {
        const pages = await Promise.all(
          locales.map(async (locale) => {
            const isFallback = !entry.locales.includes(locale);
            const sourceLocale = isFallback ? defaultLocale : locale;
            const filePath = resolve(docsRoot, entry.slug, `${sourceLocale}.md`);
            const html = renderMarkdown(readFileSync(filePath, "utf-8"));
            const title = entry.title[locale] ?? entry.title[defaultLocale];
            const gitMeta = await resolveDocGitMeta(repoRoot, filePath);
            return { locale, sourceLocale, title, html, isFallback, pinned: Boolean(entry.pinned), ...gitMeta };
          })
        );

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
