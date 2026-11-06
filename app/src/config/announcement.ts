export const ANNOUNCEMENT_SLUG = "announcement";
export const ANNOUNCEMENT_INDEX_FILE = "announcement-feed.json";

export const announcementBodyFile = (locale: string, rev: string): string => `announcement-feed/${locale}.${rev}.json`;
