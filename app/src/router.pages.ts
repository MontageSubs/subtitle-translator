export const PAGE_IDS = ["nmt", "history", "discussions", "docs", "contributors", "about"] as const;
export type PageId = (typeof PAGE_IDS)[number];
