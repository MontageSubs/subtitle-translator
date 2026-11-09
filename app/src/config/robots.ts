import type { CrawlRestriction } from "./crawlPolicy";

const INDEXABLE_DIRECTIVES = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
const NOINDEX_DIRECTIVES = "noindex";
const AI_TRAINING_DIRECTIVES = "noai,noimageai";

export const robotsDirectives = (indexable: boolean, restrictions: readonly CrawlRestriction[] = []): string => {
  const base = indexable && !restrictions.includes("index") ? INDEXABLE_DIRECTIVES : NOINDEX_DIRECTIVES;
  return restrictions.includes("ai-training") ? `${base},${AI_TRAINING_DIRECTIVES}` : base;
};

export const robotsMetaTag = (indexable: boolean, restrictions: readonly CrawlRestriction[] = []): string =>
  `<meta name="robots" content="${robotsDirectives(indexable, restrictions)}" />`;
