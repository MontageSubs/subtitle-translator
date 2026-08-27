export const PAGE_IDS = ["nmt", "history", "discussions", "docs", "contribute", "apps", "about"] as const;
export type PageId = (typeof PAGE_IDS)[number];
