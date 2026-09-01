import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import type { Plugin } from "vite";
import { resolveDocGitMeta, getEmittedAvatars, DocAuthor } from "./docsGitMeta";

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
  route?: string;
}

export type StaticPage = PageBase;

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypeStringify);

function renderMarkdown(markdown: string): string {
  return String(markdownProcessor.processSync(markdown));
}

export async function buildDocsContent(
  docsRoot: string,
  repoRoot: string,
  locales: readonly string[],
  defaultLocale: string,
  publicDir: string,
  onFile?: (path: string) => void
): Promise<{ docPages: DocPage[]; docCategories: string[]; staticPages: Record<string, StaticPage[]> }> {
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
        const gitMeta = await resolveDocGitMeta(repoRoot, filePath, publicDir);
        onFile?.(filePath);
        return { locale, sourceLocale, title, html, isFallback, pinned: Boolean(entry.pinned), ...gitMeta };
      })
    );

    const category = entry.category || "general";
    const route = entry.route || "docs";
    docPages.push(...pages.map((page) => ({ ...page, slug: entry.slug, category, route })));
    staticPages[entry.slug] = pages;
    if (entry.route && entry.route !== "docs") {
      staticPages[entry.route] = pages;
    }
  }

  const announcementDir = resolve(docsRoot, "announcement");
  const announcementLocales = locales.filter((locale) => existsSync(resolve(announcementDir, `${locale}.md`)));
  if (announcementLocales.length) {
    const announcementPages = await Promise.all(
      locales.map(async (locale) => {
        const isFallback = !announcementLocales.includes(locale);
        const sourceLocale = isFallback
          ? (announcementLocales.includes(defaultLocale) ? defaultLocale : announcementLocales[0])
          : locale;
        const filePath = resolve(announcementDir, `${sourceLocale}.md`);
        const raw = readFileSync(filePath, "utf-8");
        const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() || "Announcement";
        const html = renderMarkdown(raw);
        const gitMeta = await resolveDocGitMeta(repoRoot, filePath, publicDir);
        onFile?.(filePath);
        return { locale, sourceLocale, title, html, isFallback, pinned: false, ...gitMeta };
      })
    );
    docPages.push(...announcementPages.map((page) => ({ ...page, slug: "announcement", category: "announcement", route: "docs" })));
  }

  onFile?.(manifestPath);
  const docCategories = [...new Set(manifest.map((e) => e.category || "general"))];
  return { docPages, docCategories, staticPages };
}

export function docsContentPlugin(docsRoot: string, repoRoot: string, locales: readonly string[], defaultLocale: string, publicDir: string): Plugin {
  return {
    name: "docs-content",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },
    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return;
      const { docPages, docCategories, staticPages } = await buildDocsContent(
        docsRoot, repoRoot, locales, defaultLocale, publicDir, (path) => this.addWatchFile(path)
      );
      return `export const docPages = ${JSON.stringify(docPages)};\nexport const docCategories = ${JSON.stringify(docCategories)};\nexport const staticPages = ${JSON.stringify(staticPages)};`;
    },
    generateBundle() {
      for (const { relPath, absPath } of getEmittedAvatars()) {
        this.emitFile({ type: "asset", fileName: relPath, source: readFileSync(absPath) });
      }
    },
  };
}
