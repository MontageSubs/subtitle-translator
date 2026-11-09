export const CRAWL_RESTRICTIONS = ["index", "ai-agents", "ai-training", "crawl"] as const;

export type CrawlRestriction = (typeof CRAWL_RESTRICTIONS)[number];

export const PAGE_CRAWL_RESTRICTIONS: Readonly<Record<string, readonly CrawlRestriction[]>> = {
  history: ["index"],
};

export const isListedInSitemap = (restrictions: readonly CrawlRestriction[] = []): boolean =>
  !restrictions.includes("index") && !restrictions.includes("crawl");
