export const ANNOUNCEMENT_SLUG = "announcement";
export const ANNOUNCEMENT_INDEX_FILE = "announcement.json";

export const announcementBodyFile = (locale: string, rev: string): string => `announcement/${locale}.${rev}.json`;
