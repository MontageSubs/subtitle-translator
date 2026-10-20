export interface DocAuthor {
  login: string;
  avatarUrl: string;
}

export interface AnnouncementItem {
  tone: "info" | "warning" | "critical";
  text: string;
}

export interface HotAnnouncement {
  locale: string;
  id: string;
  rev: string;
  title: string;
  heading: string;
  summary: string;
  html: string;
  updatedAt: string;
  items: AnnouncementItem[];
}

export interface HotAnnouncementIndex {
  entries: { locale: string; id: string; rev: string; path: string }[];
}

export interface StaticPage {
  locale: string;
  sourceLocale: string;
  title: string;
  heading: string;
  summary: string;
  html: string;
  isFallback: boolean;
  pinned: boolean;
  authors: DocAuthor[];
  createdAt: string;
  updatedAt: string;
  sourceUrl: string;
}

export interface DocPage extends StaticPage {
  slug: string;
  category: string;
  route?: string;
  siteWide?: boolean;
  tickerItems?: AnnouncementItem[];
  announcementId?: string;
  hotShell?: boolean;
}

export interface DocsContent {
  docPages: DocPage[];
  hotAnnouncements: HotAnnouncement[];
  staticPages: Record<string, StaticPage[]>;
}
