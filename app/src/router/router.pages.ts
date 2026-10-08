export const PAGE_IDS = ["translator", "history", "discussions", "docs", "contribute", "apps", "about"] as const;
export type PageId = (typeof PAGE_IDS)[number];
