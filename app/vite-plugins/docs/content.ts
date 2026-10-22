import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { load } from "js-yaml";
import { repoFileUrl, SiteConfig } from "../../src/config/site";
import { escapeHtml } from "../../src/utils/escapeHtml";
import type { DocPage, DocsContent, HotAnnouncement, StaticPage } from "../../src/types/docs";
import { ANNOUNCEMENT_SLUG } from "../../src/config/announcement";
import { readLocaleText } from "../i18n/locales";
import { parseAnnouncement } from "./announcement";
import { resolveDocGitMeta } from "./gitMeta";
import { LinkContext, SlugInfo } from "./links";
import { RenderedMarkdown, renderMarkdown } from "./markdown";

export interface DocsBuildOptions {
  docsRoot: string;
  repoRoot: string;
  assetCacheDir: string;
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
  siteWide?: boolean;
  global?: boolean;
  title?: Record<string, string>;
}

interface PageSource {
  filePath: string;
  locale: string;
  sourceLocale: string;
  title: string;
  rendered: RenderedMarkdown;
  pinned: boolean;
}

const UNPUBLISHABLE_DIRECTORIES: ReadonlySet<string> = new Set(["github"]);
const DEFAULT_CATEGORY = "general";
const DOCS_ROUTE = "docs";
const HEADING_PATTERN = /^#\s+(.+)$/m;

function authoredLocales(options: DocsBuildOptions, slug: string): string[] {
  return options.locales.filter((locale) => existsSync(resolve(options.docsRoot, slug, `${locale}.md`)));
}

function slugInfoOf(options: DocsBuildOptions, manifest: ManifestEntry[]): Map<string, SlugInfo> {
  return new Map(manifest.map((entry) => [entry.slug, { route: entry.route || DOCS_ROUTE, locales: authoredLocales(options, entry.slug) }]));
}

function assertPublishable(manifest: ManifestEntry[]): void {
  const blocked = manifest.find((entry) => UNPUBLISHABLE_DIRECTORIES.has(entry.slug));
  if (blocked) throw new Error(`docs/${blocked.slug} is reserved for repository-only files and cannot be published`);
}

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
    summary: rendered.summary,
    html: rendered.html,
    isFallback: page.locale !== page.sourceLocale,
    sourceUrl: repoFileUrl(options.site, repoRelativePath),
    ...(await resolveDocGitMeta(options.repoRoot, filePath, options.assetCacheDir)),
  };
}

async function buildManifestPages(options: DocsBuildOptions, manifest: ManifestEntry[], slugInfo: ReadonlyMap<string, SlugInfo>, onFile?: FileObserver) {
  const { docsRoot, locales, defaultLocale, basePath, assetCacheDir, site } = options;
  const docPages: DocPage[] = [];
  const staticPages: Record<string, StaticPage[]> = {};

  for (const entry of manifest) {
    const authored = authoredLocales(options, entry.slug);
    const pages = await Promise.all(locales.map(async (locale) => {
      const sourceLocale = authored.includes(locale) ? locale : defaultLocale;
      const filePath = resolve(docsRoot, entry.slug, `${sourceLocale}.md`);
      const context: LinkContext = { fromSlug: entry.slug, locale, locales, defaultLocale, basePath, assetCacheDir, docsRoot, siteUrl: site.siteUrl, slugInfo };
      const markdown = readFileSync(filePath, "utf-8");
      const rendered = await renderMarkdown(markdown, context);
      const title = entry.title?.[locale] ?? markdown.match(HEADING_PATTERN)?.[1].trim() ?? entry.title?.[defaultLocale] ?? entry.slug;
      return describePage(options, { filePath, locale, sourceLocale, title, rendered, pinned: Boolean(entry.pinned) }, onFile);
    }));

    const route = entry.route || DOCS_ROUTE;
    docPages.push(...pages.map((page) => ({ ...page, slug: entry.slug, category: entry.category || DEFAULT_CATEGORY, route })));
    staticPages[entry.slug] = pages;
    if (route !== DOCS_ROUTE) staticPages[route] = pages;
  }
  return { docPages, staticPages };
}

const HOT_REVISION_LENGTH = 10;
const FALLBACK_ANNOUNCEMENT_LABEL = "Announcement";

function toHotAnnouncement(page: DocPage, locale: string): HotAnnouncement {
  const content = { locale, id: page.announcementId ?? "", title: page.title, heading: page.heading, summary: page.summary, html: page.html, updatedAt: page.updatedAt, items: page.tickerItems ?? [] };
  return { ...content, rev: createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, HOT_REVISION_LENGTH) };
}

function toHotShell(page: DocPage): DocPage {
  const label = readLocaleText(page.locale, "shell.announcementLabel") ?? FALLBACK_ANNOUNCEMENT_LABEL;
  return { ...page, title: label, heading: `<h1>${escapeHtml(label)}</h1>`, summary: "", html: "", authors: [], createdAt: "", updatedAt: "", tickerItems: [], announcementId: "", hotShell: true };
}

export const withHotShells = (pages: DocPage[]): DocPage[] => pages.map((page) => (page.slug === ANNOUNCEMENT_SLUG && page.siteWide ? toHotShell(page) : page));

async function buildAnnouncementPages(options: DocsBuildOptions, slugInfo: ReadonlyMap<string, SlugInfo>, manifestEntry?: ManifestEntry, onFile?: FileObserver): Promise<{ pages: DocPage[]; hotAnnouncements: HotAnnouncement[] }> {
  const { docsRoot, locales, defaultLocale, basePath, assetCacheDir, site } = options;
  const available = locales.filter((locale) => existsSync(resolve(docsRoot, ANNOUNCEMENT_SLUG, `${locale}.md`)));
  if (!available.length) return { pages: [], hotAnnouncements: [] };
  const fallbackLocale = available.includes(defaultLocale) ? defaultLocale : available[0];
  const fallbackRaw = readFileSync(resolve(docsRoot, ANNOUNCEMENT_SLUG, `${fallbackLocale}.md`), "utf-8");
  const fallbackParsed = parseAnnouncement(fallbackRaw, fallbackLocale);

  const hotAnnouncements: HotAnnouncement[] = [];
  const pages = await Promise.all(locales.map(async (locale) => {
    const sourceLocale = available.includes(locale) ? locale : fallbackLocale;
    const filePath = resolve(docsRoot, ANNOUNCEMENT_SLUG, `${sourceLocale}.md`);
    const parsed = parseAnnouncement(readFileSync(filePath, "utf-8"), locale);
    const context: LinkContext = { fromSlug: ANNOUNCEMENT_SLUG, locale, locales, defaultLocale, basePath, assetCacheDir, docsRoot, siteUrl: site.siteUrl, slugInfo };
    const rendered = await renderMarkdown(parsed.markdown, context);
    const title = manifestEntry?.title?.[locale] ?? parsed.title;
    const pinned = manifestEntry?.pinned ?? parsed.pinned ?? fallbackParsed.pinned ?? false;
    const siteWide = manifestEntry?.siteWide ?? manifestEntry?.global ?? parsed.siteWide ?? fallbackParsed.siteWide ?? false;
    const page = await describePage(options, { filePath, locale, sourceLocale, title, rendered, pinned }, onFile);
    const announcement: DocPage = { ...page, slug: ANNOUNCEMENT_SLUG, category: manifestEntry?.category || ANNOUNCEMENT_SLUG, route: manifestEntry?.route || DOCS_ROUTE, tickerItems: parsed.tickerItems, announcementId: parsed.announcementId, siteWide };
    if (siteWide) hotAnnouncements.push(toHotAnnouncement(announcement, locale));
    return announcement;
  }));
  return { pages, hotAnnouncements };
}

export async function buildDocsContent(options: DocsBuildOptions, onFile?: FileObserver): Promise<DocsContent> {
  const manifestPath = resolve(options.docsRoot, "manifest.yml");
  const manifest = load(readFileSync(manifestPath, "utf-8")) as ManifestEntry[];
  assertPublishable(manifest);
  const slugInfo = slugInfoOf(options, manifest);

  const manifestEntries = manifest.filter((entry) => entry.slug !== ANNOUNCEMENT_SLUG);
  const announcementManifest = manifest.find((entry) => entry.slug === ANNOUNCEMENT_SLUG);
  const { docPages, staticPages } = await buildManifestPages(options, manifestEntries, slugInfo, onFile);
  const announcements = await buildAnnouncementPages(options, slugInfo, announcementManifest, onFile);
  docPages.push(...announcements.pages);
  onFile?.(manifestPath);
  return { docPages, staticPages, hotAnnouncements: announcements.hotAnnouncements };
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
