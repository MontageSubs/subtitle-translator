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
import { resolveDocGitMeta, getEmittedAssets, downloadDocImage, DocAuthor } from "./docsGitMeta";
import { pageRoutePath, joinPath } from "../src/render/paths";
import { PAGE_IDS, PageId } from "../src/router/router.pages";

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
  data?: Record<string, unknown>;
  children?: MdastNode[];
}

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

interface SlugInfo {
  route: string;
  locales: readonly string[];
}

interface LinkContext {
  fromSlug: string;
  locale: string;
  locales: readonly string[];
  defaultLocale: string;
  basePath: string;
  publicDir: string;
  slugInfo: ReadonlyMap<string, SlugInfo>;
}

interface InternalLink {
  href: string;
  newTab: boolean;
}

function walk<T extends { children?: T[] }>(node: T, visit: (node: T) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function resolveDocTarget(targetSlug: string, explicitLocale: string | undefined, context: LinkContext): string {
  const info = context.slugInfo.get(targetSlug);
  if (!info) throw new Error(`Unresolvable document "${targetSlug}" referenced from docs/${context.fromSlug}/${context.locale}.md`);
  const desiredLocale = explicitLocale || context.locale;
  const targetLocale = info.locales.includes(desiredLocale) ? desiredLocale : context.defaultLocale;
  return pageRoutePath(context.basePath, targetLocale, info.route, info.route === "docs" ? [targetSlug] : []);
}

function resolveRelativeLink(path: string, context: LinkContext): string | undefined {
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
  return resolveDocTarget(targetSlug, fileName?.replace(/\.md$/, ""), context);
}

function resolveAbsoluteLink(path: string, context: LinkContext): string {
  const segments = path.slice(1).split("/").filter(Boolean);
  const hasLocalePrefix = context.locales.includes(segments[0]);
  const explicitLocale = hasLocalePrefix ? segments[0] : undefined;
  const [page, ...rest] = hasLocalePrefix ? segments.slice(1) : segments;

  if (page === "docs") {
    const [targetSlug, fileName] = rest;
    if (!targetSlug) throw new Error(`Unresolvable internal link "${path}" in docs/${context.fromSlug}/${context.locale}.md`);
    return resolveDocTarget(targetSlug, fileName?.replace(/\.md$/, "") || explicitLocale, context);
  }

  if (!PAGE_IDS.includes(page as PageId)) {
    throw new Error(`Unresolvable internal link "${path}" in docs/${context.fromSlug}/${context.locale}.md`);
  }
  return pageRoutePath(context.basePath, explicitLocale || context.locale, page, rest);
}

const NEW_TAB_MARKER = /^([^?#]*)(\?newtab)?(#.*)?$/;

function resolveInternalLink(url: string, context: LinkContext): InternalLink | undefined {
  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//") || url.startsWith("#")) return undefined;

  const match = url.match(NEW_TAB_MARKER);
  if (!match) return undefined;
  const [, path, newTabMarker, hash] = match;

  const href = path.startsWith("/") ? resolveAbsoluteLink(path, context) : resolveRelativeLink(path, context);
  if (!href) return undefined;
  return { href: hash ? `${href}${hash}` : href, newTab: Boolean(newTabMarker) };
}

function remarkResolveDocLinks(context: LinkContext) {
  return (tree: MdastNode) => {
    walk(tree, (node) => {
      if (node.type !== "link" || !node.url) return;
      const resolved = resolveInternalLink(node.url, context);
      if (!resolved) return;
      node.url = resolved.href;
      if (resolved.newTab) {
        node.data = { ...node.data, hProperties: { target: "_blank", rel: "noopener noreferrer" } };
      }
    });
  };
}

function remarkCacheDocImages(context: LinkContext) {
  return async (tree: MdastNode) => {
    const images: MdastNode[] = [];
    walk(tree, (node) => {
      if (node.type === "image" && node.url && /^https?:\/\//i.test(node.url)) images.push(node);
    });
    await Promise.all(
      images.map(async (node) => {
        const relPath = await downloadDocImage(node.url!, context.publicDir);
        if (relPath) node.url = joinPath(context.basePath, [relPath]);
      })
    );
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

async function renderMarkdown(markdown: string, context: LinkContext): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCacheDocImages, context)
    .use(remarkResolveDocLinks, context)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeMarkExternalLinks)
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
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
  const slugInfo = new Map(manifest.map((entry) => [entry.slug, { route: entry.route || "docs", locales: entry.locales }]));
  const basePath = process.env.VITE_BASE_PATH || "/";
  const docPages: DocPage[] = [];
  const staticPages: Record<string, StaticPage[]> = {};

  for (const entry of manifest) {
    const pages = await Promise.all(
      locales.map(async (locale) => {
        const isFallback = !entry.locales.includes(locale);
        const sourceLocale = isFallback ? defaultLocale : locale;
        const filePath = resolve(docsRoot, entry.slug, `${sourceLocale}.md`);
        const html = await renderMarkdown(readFileSync(filePath, "utf-8"), { fromSlug: entry.slug, locale, locales, defaultLocale, basePath, publicDir, slugInfo });
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
        const html = await renderMarkdown(body, { fromSlug: "announcement", locale, locales, defaultLocale, basePath, publicDir, slugInfo });
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
      for (const { relPath, absPath } of getEmittedAssets()) {
        this.emitFile({ type: "asset", fileName: relPath, source: readFileSync(absPath) });
      }
    },
  };
}
