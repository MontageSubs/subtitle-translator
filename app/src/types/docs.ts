export interface DocAuthor {
  login: string;
  avatarUrl: string;
}

export interface AnnouncementItem {
  tone: "info" | "warning" | "critical";
  text: string;
}

export interface StaticPage {
  locale: string;
  sourceLocale: string;
  title: string;
  heading: string;
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
  tickerItems?: AnnouncementItem[];
  announcementId?: string;
}

export interface DocsContent {
  docPages: DocPage[];
  staticPages: Record<string, StaticPage[]>;
}
