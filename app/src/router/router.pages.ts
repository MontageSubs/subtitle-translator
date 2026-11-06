export const PAGE_IDS = ["translator", "history", "models", "discussions", "docs", "contribute", "tools", "about"] as const;
export type PageId = (typeof PAGE_IDS)[number];
