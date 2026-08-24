declare module "virtual:docs-content" {
  export interface DocAuthor {
    login: string;
    avatarUrl: string;
  }

  export interface DocPage {
    slug: string;
    category: string;
    locale: string;
    sourceLocale: string;
    title: string;
    html: string;
    isFallback: boolean;
    pinned: boolean;
    authors: DocAuthor[];
    createdAt: string;
    updatedAt: string;
  }

  export interface StaticPage {
    locale: string;
    sourceLocale: string;
    title: string;
    html: string;
    isFallback: boolean;
    pinned: boolean;
    authors: DocAuthor[];
    createdAt: string;
    updatedAt: string;
  }

  export const docPages: DocPage[];
  export const docCategories: string[];
  export const staticPages: Record<string, StaticPage[]>;
}
