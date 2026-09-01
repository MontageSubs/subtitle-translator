import type { Plugin } from "vite";
import { buildDocsContent, StaticPage } from "./docsContent";

interface Alternate {
  hreflang: string;
  path: string;
}

interface SitemapEntry {
  path: string;
  priority: number;
  changefreq: string;
  lastmod?: string;
  alternates: Alternate[];
}

const PRIORITY_BY_PAGE: Record<string, number> = { nmt: 1, docs: 0.8 };
const CHANGEFREQ_BY_PAGE: Record<string, string> = { nmt: "weekly", docs: "weekly" };
const DEFAULT_PRIORITY = 0.6;
const DEFAULT_CHANGEFREQ = "monthly";

function isoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function localizedAlternates(pagePath: (locale: string) => string, locales: readonly string[], defaultLocale: string): Alternate[] {
  return [
    ...locales.map((hreflang) => ({ hreflang, path: pagePath(hreflang) })),
    { hreflang: "x-default", path: pagePath(defaultLocale) },
  ];
}

function renderUrl(base: string, entry: SitemapEntry, buildDate: string): string {
  const alternatesXml = entry.alternates
    .map((alt) => `\n    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${base}/${alt.path}" />`)
    .join("");
  return `  <url>\n    <loc>${base}/${entry.path}</loc>${alternatesXml}\n    <lastmod>${entry.lastmod ?? buildDate}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority.toFixed(1)}</priority>\n  </url>`;
}

export function sitemapPlugin(
  docsRoot: string,
  repoRoot: string,
  publicDir: string,
  siteUrl: string,
  locales: readonly string[],
  defaultLocale: string,
  pageIds: readonly string[]
): Plugin {
  return {
    name: "sitemap",
    apply: "build",
    async generateBundle() {
      const base = siteUrl.replace(/\/$/, "");
      const buildDate = new Date().toISOString().slice(0, 10);
      const { docPages, staticPages } = await buildDocsContent(docsRoot, repoRoot, locales, defaultLocale, publicDir);
      const entries: SitemapEntry[] = [];

      entries.push({
        path: "",
        priority: 0.5,
        changefreq: DEFAULT_CHANGEFREQ,
        alternates: localizedAlternates((locale) => `${locale}/nmt/`, locales, defaultLocale),
      });

      for (const pageId of pageIds) {
        const alternates = localizedAlternates((locale) => `${locale}/${pageId}/`, locales, defaultLocale);
        const contentByLocale = (staticPages[pageId] as StaticPage[] | undefined) ?? [];
        for (const locale of locales) {
          entries.push({
            path: `${locale}/${pageId}/`,
            priority: PRIORITY_BY_PAGE[pageId] ?? DEFAULT_PRIORITY,
            changefreq: CHANGEFREQ_BY_PAGE[pageId] ?? DEFAULT_CHANGEFREQ,
            lastmod: isoDate(contentByLocale.find((p) => p.locale === locale)?.updatedAt),
            alternates,
          });
        }
      }

      const docSlugs = [...new Set(docPages.filter((p) => p.slug !== "announcement").map((p) => p.slug))];
      for (const slug of docSlugs) {
        const variants = docPages.filter((p) => p.slug === slug);
        const priority = variants.some((p) => p.pinned) ? 0.8 : 0.65;
        const alternates = localizedAlternates((locale) => `${locale}/docs/${slug}/`, locales, defaultLocale);
        for (const locale of locales) {
          const page = variants.find((p) => p.locale === locale);
          entries.push({
            path: `${locale}/docs/${slug}/`,
            priority,
            changefreq: DEFAULT_CHANGEFREQ,
            lastmod: isoDate(page?.updatedAt || page?.createdAt),
            alternates,
          });
        }
      }

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries
        .map((entry) => renderUrl(base, entry, buildDate))
        .join("\n")}\n</urlset>\n`;
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });

      const robots = `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
    },
  };
}
