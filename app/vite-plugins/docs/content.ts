import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { load } from "js-yaml";
import { repoFileUrl, SiteConfig } from "../../src/config/site";
import { escapeHtml } from "../../src/utils/escapeHtml";
import type { DocPage, DocsContent, StaticPage } from "../../src/types/docs";
import { parseAnnouncement } from "./announcement";
import { resolveDocGitMeta } from "./gitMeta";
import { LinkContext, SlugInfo } from "./links";
import { RenderedMarkdown, renderMarkdown } from "./markdown";

export interface DocsBuildOptions {
  docsRoot: string;
  repoRoot: string;
  publicDir: string;
  locales: readonly string[];
  defaultLocale: string;
  basePath: string;
  site: SiteConfig;
}

interface ManifestEntry {
  slug: string;
  route?: string;
  category?: string;
  pinned?: boolean;
  title: Record<string, string>;
  locales: string[];
}

interface PageSource {
  filePath: string;
  locale: string;
  sourceLocale: string;
  title: string;
  rendered: RenderedMarkdown;
  pinned: boolean;
}

const ANNOUNCEMENT_SLUG = "announcement";
const DEFAULT_CATEGORY = "general";
const DOCS_ROUTE = "docs";

export type FileObserver = (path: string) => void;

export interface DocsSource {
  load(onFile?: FileObserver): Promise<DocsContent>;
  current(): Promise<DocsContent>;
}

async function describePage(options: DocsBuildOptions, source: PageSource, onFile?: FileObserver): Promise<StaticPage> {
  const { filePath, rendered, ...page } = source;
  const repoRelativePath = relative(options.repoRoot, filePath).split("\\").join("/");
  onFile?.(filePath);
  return {
    ...page,
    heading: rendered.heading || `<h1>${escapeHtml(page.title)}</h1>`,
    html: rendered.html,
    isFallback: page.locale !== page.sourceLocale,
    sourceUrl: repoFileUrl(options.site, repoRelativePath),
    ...(await resolveDocGitMeta(options.repoRoot, filePath, options.publicDir)),
  };
}

async function buildManifestPages(options: DocsBuildOptions, manifest: ManifestEntry[], slugInfo: ReadonlyMap<string, SlugInfo>, onFile?: FileObserver) {
  const { docsRoot, locales, defaultLocale, basePath, publicDir, site } = options;
  const docPages: DocPage[] = [];
  const staticPages: Record<string, StaticPage[]> = {};

  for (const entry of manifest) {
    const pages = await Promise.all(locales.map(async (locale) => {
      const sourceLocale = entry.locales.includes(locale) ? locale : defaultLocale;
      const filePath = resolve(docsRoot, entry.slug, `${sourceLocale}.md`);
      const context: LinkContext = { fromSlug: entry.slug, locale, locales, defaultLocale, basePath, publicDir, siteUrl: site.siteUrl, slugInfo };
      const rendered = await renderMarkdown(readFileSync(filePath, "utf-8"), context);
      return describePage(options, { filePath, locale, sourceLocale, title: entry.title[locale] ?? entry.title[defaultLocale], rendered, pinned: Boolean(entry.pinned) }, onFile);
    }));

    const route = entry.route || DOCS_ROUTE;
    docPages.push(...pages.map((page) => ({ ...page, slug: entry.slug, category: entry.category || DEFAULT_CATEGORY, route })));
    staticPages[entry.slug] = pages;
    if (route !== DOCS_ROUTE) staticPages[route] = pages;
  }
  return { docPages, staticPages };
}

async function buildAnnouncementPages(options: DocsBuildOptions, slugInfo: ReadonlyMap<string, SlugInfo>, onFile?: FileObserver): Promise<DocPage[]> {
  const { docsRoot, locales, defaultLocale, basePath, publicDir, site } = options;
  const available = locales.filter((locale) => existsSync(resolve(docsRoot, ANNOUNCEMENT_SLUG, `${locale}.md`)));
  if (!available.length) return [];
  const fallbackLocale = available.includes(defaultLocale) ? defaultLocale : available[0];

  return Promise.all(locales.map(async (locale) => {
    const sourceLocale = available.includes(locale) ? locale : fallbackLocale;
    const filePath = resolve(docsRoot, ANNOUNCEMENT_SLUG, `${sourceLocale}.md`);
    const { title, markdown, tickerItems, announcementId } = parseAnnouncement(readFileSync(filePath, "utf-8"), locale);
    const context: LinkContext = { fromSlug: ANNOUNCEMENT_SLUG, locale, locales, defaultLocale, basePath, publicDir, siteUrl: site.siteUrl, slugInfo };
    const rendered = await renderMarkdown(markdown, context);
    const page = await describePage(options, { filePath, locale, sourceLocale, title, rendered, pinned: true }, onFile);
    return { ...page, slug: ANNOUNCEMENT_SLUG, category: ANNOUNCEMENT_SLUG, route: DOCS_ROUTE, tickerItems, announcementId };
  }));
}

export async function buildDocsContent(options: DocsBuildOptions, onFile?: FileObserver): Promise<DocsContent> {
  const manifestPath = resolve(options.docsRoot, "manifest.yml");
  const manifest = load(readFileSync(manifestPath, "utf-8")) as ManifestEntry[];
  const slugInfo = new Map(manifest.map((entry) => [entry.slug, { route: entry.route || DOCS_ROUTE, locales: entry.locales }]));

  const { docPages, staticPages } = await buildManifestPages(options, manifest, slugInfo, onFile);
  docPages.push(...await buildAnnouncementPages(options, slugInfo, onFile));
  onFile?.(manifestPath);
  return { docPages, staticPages };
}

export function createDocsSource(options: DocsBuildOptions): DocsSource {
  let latest: Promise<DocsContent> | null = null;
  const source: DocsSource = {
    load(onFile) {
      latest = buildDocsContent(options, onFile);
      return latest;
    },
    current() {
      return latest ?? source.load();
    },
  };
  return source;
}
