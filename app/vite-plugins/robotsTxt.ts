import type { Plugin } from "vite";
import { nestedBasePaths, type ChannelProfile } from "../src/config/channelProfile";
import { PAGE_CRAWL_RESTRICTIONS, type CrawlRestriction } from "../src/config/crawlPolicy";
import type { SiteConfig } from "../src/config/site";
import { routePath } from "../src/render/paths";
import type { DocsContent } from "../src/types/docs";
import { AI_AGENT_CRAWLERS, AI_TRAINING_CRAWLERS } from "./crawlers";
import type { DocsSource } from "./docs/content";

interface RestrictedPath {
  path: string;
  restrictions: readonly CrawlRestriction[];
}

const DOCS_ROUTE = "docs";

function restrictedPaths(prefix: string, locales: readonly string[], { docPages }: DocsContent): RestrictedPath[] {
  const pages = Object.entries(PAGE_CRAWL_RESTRICTIONS).flatMap(([page, restrictions]) => [
    ...locales.map((locale) => ({ path: routePath(prefix, [locale, page]), restrictions })),
    { path: routePath(prefix, [page]), restrictions },
  ]);
  const docs = docPages.filter((page) => page.locale === locales[0] && page.restrictions.length > 0).flatMap(({ slug, route, restrictions }) => {
    const segments = [[DOCS_ROUTE, slug], ...(route && route !== DOCS_ROUTE ? [[route]] : [])];
    return segments.flatMap((tail) => [...locales.map((locale) => ({ path: routePath(prefix, [locale, ...tail]), restrictions })), { path: routePath(prefix, tail), restrictions }]);
  });
  return [...pages, ...docs];
}

const pathsRestrictedBy = (entries: readonly RestrictedPath[], restriction: CrawlRestriction): string[] =>
  [...new Set(entries.filter(({ restrictions }) => restrictions.includes(restriction)).map(({ path }) => path))];

const group = (agents: readonly string[], disallowed: readonly string[], allowRoot = false): string =>
  [...agents.map((agent) => `User-agent: ${agent}`), ...(allowRoot ? ["Allow: /"] : []), ...disallowed.map((path) => `Disallow: ${path}`)].join("\n");

export function renderRobotsTxt(siteUrl: string, locales: readonly string[], content: DocsContent, channel: ChannelProfile): string {
  if (!channel.indexable) return group(["*"], ["/"]) + "\n";
  const prefix = new URL(siteUrl).pathname.replace(/\/+$/, "");
  const entries = restrictedPaths(prefix, locales, content);
  const crawl = [...nestedBasePaths(channel), ...pathsRestrictedBy(entries, "crawl")];
  const specific = [
    { agents: AI_TRAINING_CRAWLERS, paths: pathsRestrictedBy(entries, "ai-training") },
    { agents: AI_AGENT_CRAWLERS, paths: pathsRestrictedBy(entries, "ai-agents") },
  ].filter(({ paths }) => paths.length > 0);
  const groups = [group(["*"], crawl, true), ...specific.map(({ agents, paths }) => group(agents, [...new Set([...crawl, ...paths])]))];
  return `${groups.join("\n\n")}\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

export function robotsTxtPlugin(source: DocsSource, { siteUrl }: SiteConfig, locales: readonly string[], channel: ChannelProfile): Plugin {
  return {
    name: "robots-txt",
    apply: "build",
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: "robots.txt", source: renderRobotsTxt(siteUrl, locales, await source.current(), channel) });
    },
  };
}
