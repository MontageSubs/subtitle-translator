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
import { pageRoutePath } from "../src/render/paths";

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

export interface AnnouncementItem {
  tone: "info" | "warning" | "critical";
  text: string;
}

export interface DocPage extends PageBase {
  slug: string;
  category: string;
  route?: string;
  tickerItems?: AnnouncementItem[];
  announcementId?: string;
}

export type StaticPage = PageBase;

interface MdastNode {
  type: string;
  url?: string;
  children?: MdastNode[];
}

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

interface LinkContext {
  fromSlug: string;
  locale: string;
  locales: readonly string[];
  basePath: string;
  slugRoutes: ReadonlyMap<string, string>;
}

function walk<T extends { children?: T[] }>(node: T, visit: (node: T) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function resolveDocLink(url: string, context: LinkContext): string | undefined {
  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//") || url.startsWith("#") || url.startsWith("/")) return undefined;

  const [path, hash] = url.split("#");
  const resolved: string[] = [context.fromSlug];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (resolved.length === 0) return undefined;
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  if (resolved.length === 0) return undefined;

  const [targetSlug, fileName] = resolved;
  const route = context.slugRoutes.get(targetSlug);
  if (!route) throw new Error(`Unresolvable internal link "${url}" in docs/${context.fromSlug}/${context.locale}.md`);

  const fileLocale = fileName?.replace(/\.md$/, "");
  const targetLocale = fileLocale && context.locales.includes(fileLocale) ? fileLocale : context.locale;
  const resolvedPath = pageRoutePath(context.basePath, targetLocale, route, route === "docs" ? [targetSlug] : []);
  return hash ? `${resolvedPath}#${hash}` : resolvedPath;
}

function remarkResolveDocLinks(context: LinkContext) {
  return (tree: MdastNode) => {
    walk(tree, (node) => {
      if (node.type === "link" && node.url) {
        const resolved = resolveDocLink(node.url, context);
        if (resolved) node.url = resolved;
      }
    });
  };
}

const EXTERNAL_LINK_ICON: HastNode = {
  type: "element",
  tagName: "svg",
  properties: {
    viewBox: "0 0 24 24",
    width: "0.7em",
    height: "0.7em",
    "aria-hidden": "true",
    focusable: "false",
    style: "margin-left:0.25em;vertical-align:-0.05em",
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: { fill: "currentColor", d: "M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h5v2H7v10h10v-3h2v5H5V5z" },
      children: [],
    },
  ],
};

function rehypeMarkExternalLinks() {
  return (tree: HastNode) => {
    walk(tree, (node) => {
      if (node.type !== "element" || node.tagName !== "a") return;
      const href = String(node.properties?.href ?? "");
      if (!/^https?:\/\//i.test(href)) return;
      node.properties = { ...node.properties, target: "_blank", rel: "noopener noreferrer" };
      node.children = [...(node.children ?? []), EXTERNAL_LINK_ICON];
    });
  };
}

function renderMarkdown(markdown: string, context: LinkContext): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkResolveDocLinks, context)
      .use(remarkRehype)
      .use(rehypeSlug)
      .use(rehypeMarkExternalLinks)
      .use(rehypeStringify)
      .processSync(markdown)
  );
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) return { data: {}, body: raw };
  return { data: (load(match[1]) as Record<string, unknown>) || {}, body: raw.slice(match[0].length) };
}

function readTickerItems(data: Record<string, unknown>, fallbackText: string): AnnouncementItem[] {
  const raw = Array.isArray(data.items) ? data.items : [];
  const items = raw
    .map((entry) => ({ tone: (entry?.tone as AnnouncementItem["tone"]) || "info", text: String(entry?.text || "").trim() }))
    .filter((item) => item.text);
  return items.length ? items : [{ tone: "info", text: fallbackText }];
}

function readAnnouncementId(data: Record<string, unknown>): string {
  return typeof data.id === "string" && data.id.trim() ? data.id.trim() : "default";
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
  const slugRoutes = new Map(manifest.map((entry) => [entry.slug, entry.route || "docs"]));
  const basePath = process.env.VITE_BASE_PATH || "/";
  const docPages: DocPage[] = [];
  const staticPages: Record<string, StaticPage[]> = {};

  for (const entry of manifest) {
    const pages = await Promise.all(
      locales.map(async (locale) => {
        const isFallback = !entry.locales.includes(locale);
        const sourceLocale = isFallback ? defaultLocale : locale;
        const filePath = resolve(docsRoot, entry.slug, `${sourceLocale}.md`);
        const html = renderMarkdown(readFileSync(filePath, "utf-8"), { fromSlug: entry.slug, locale, locales, basePath, slugRoutes });
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
        const { data, body } = splitFrontmatter(raw);
        const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || "Announcement";
        const html = renderMarkdown(body, { fromSlug: "announcement", locale, locales, basePath, slugRoutes });
        const tickerItems = readTickerItems(data, title);
        const announcementId = readAnnouncementId(data);
        const gitMeta = await resolveDocGitMeta(repoRoot, filePath, publicDir);
        onFile?.(filePath);
        return { locale, sourceLocale, title, html, isFallback, pinned: false, tickerItems, announcementId, ...gitMeta };
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
