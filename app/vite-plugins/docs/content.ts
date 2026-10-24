import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { load } from "js-yaml";
import { repoFileUrl, SiteConfig } from "../../src/config/site";
import { escapeHtml } from "../../src/utils/escapeHtml";
import type { Announcement, BannerConfig, BannerTone, DocPage, DocsContent, StaticPage } from "../../src/types/docs";
import { ANNOUNCEMENT_SLUG } from "../../src/config/announcement";
import { assertVersionRange } from "../../src/utils/versionRange";
import { readLocaleText } from "../i18n/locales";
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
  banner?: { tone?: BannerTone; versions?: string };
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
const BANNER_TONES: readonly BannerTone[] = ["blue", "yellow", "red"];
const REVISION_LENGTH = 10;
const PLACEHOLDER_KEY = "docs.loading";
const digest = (value: unknown, length: number): string => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);

function bannerOf(entry: ManifestEntry): BannerConfig | undefined {
  if (!entry.banner) return undefined;
  const { tone = "blue", versions = "" } = entry.banner;
  if (!BANNER_TONES.includes(tone)) throw new Error(`docs/manifest.yml: "${entry.slug}" banner tone must be one of ${BANNER_TONES.join(", ")}`);
  if (entry.slug !== ANNOUNCEMENT_SLUG) throw new Error(`docs/manifest.yml: only "${ANNOUNCEMENT_SLUG}" can have a banner`);
  assertVersionRange(versions);
  return { tone, versions };
}

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
  const announcements: Announcement[] = [];
  const staticPages: Record<string, StaticPage[]> = {};

  for (const entry of manifest) {
    const authored = authoredLocales(options, entry.slug);
    const banner = bannerOf(entry);
    const isAnnouncement = entry.slug === ANNOUNCEMENT_SLUG;
    const pages = await Promise.all(locales.map(async (locale) => {
      const sourceLocale = authored.includes(locale) ? locale : defaultLocale;
      const filePath = resolve(docsRoot, entry.slug, `${sourceLocale}.md`);
      const context: LinkContext = { fromSlug: entry.slug, locale, locales, defaultLocale, basePath, assetCacheDir, docsRoot, siteUrl: site.siteUrl, slugInfo };
      const markdown = readFileSync(filePath, "utf-8");
      const rendered = await renderMarkdown(markdown, context);
      const title = entry.title?.[locale] ?? markdown.match(HEADING_PATTERN)?.[1].trim() ?? entry.title?.[defaultLocale] ?? entry.slug;
      const page = await describePage(options, { filePath, locale, sourceLocale, title, rendered, pinned: Boolean(entry.pinned) }, onFile);
      return isAnnouncement ? { ...page, authors: [] } : page;
    }));

    const route = entry.route || DOCS_ROUTE;
    docPages.push(...pages.map((page) => ({
      ...page,
      slug: entry.slug,
      category: entry.category || DEFAULT_CATEGORY,
      route,
      ...(banner && { banner, bannerId: digest([page.locale, page.title, banner], REVISION_LENGTH) }),
    })));
    staticPages[entry.slug] = pages;
    if (route !== DOCS_ROUTE) staticPages[route] = pages;
    if (isAnnouncement) announcements.push(...pages.map((page) => toAnnouncement(page, banner)));
  }
  return { docPages, staticPages, announcements };
}

function toAnnouncement({ locale, title, heading, summary, html, createdAt, updatedAt }: StaticPage, banner?: BannerConfig): Announcement {
  const content = { locale, title, heading, summary, html, createdAt, updatedAt, ...(banner && { banner, bannerId: digest([locale, title, banner], REVISION_LENGTH) }) };
  return { ...content, rev: digest(content, REVISION_LENGTH) };
}

function toShell(page: DocPage): DocPage {
  const { banner: _banner, bannerId: _bannerId, ...rest } = page;
  const title = readLocaleText(page.locale, PLACEHOLDER_KEY) ?? page.title;
  return { ...rest, title, heading: `<h1>${escapeHtml(title)}</h1>`, summary: "", html: "", createdAt: "", updatedAt: "", hotShell: true };
}

export const withShells = (pages: DocPage[]): DocPage[] => pages.map((page) => (page.slug === ANNOUNCEMENT_SLUG ? toShell(page) : page));

export async function buildDocsContent(options: DocsBuildOptions, onFile?: FileObserver): Promise<DocsContent> {
  const manifestPath = resolve(options.docsRoot, "manifest.yml");
  const manifest = load(readFileSync(manifestPath, "utf-8")) as ManifestEntry[];
  assertPublishable(manifest);
  const content = await buildManifestPages(options, manifest, slugInfoOf(options, manifest), onFile);
  onFile?.(manifestPath);
  return content;
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
