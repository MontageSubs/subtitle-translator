export interface DocAuthor {
  login: string;
  avatarUrl: string;
}

export type BannerTone = "blue" | "yellow" | "red";

export interface BannerConfig {
  tone: BannerTone;
  versions: string;
}

export interface AnnouncementMeta {
  locale: string;
  rev: string;
  title: string;
  bannerId?: string;
  banner?: BannerConfig;
}

export interface Announcement extends AnnouncementMeta {
  heading: string;
  summary: string;
  html: string;
  updatedAt: string;
}

export interface AnnouncementIndex {
  entries: AnnouncementMeta[];
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
  banner?: BannerConfig;
  bannerId?: string;
  hotShell?: boolean;
}

export interface DocsContent {
  docPages: DocPage[];
  announcements: Announcement[];
  staticPages: Record<string, StaticPage[]>;
}
