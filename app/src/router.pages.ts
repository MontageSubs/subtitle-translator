export const PAGE_IDS = ["nmt", "docs", "about", "contributors", "discussions"] as const;
export type PageId = (typeof PAGE_IDS)[number];
