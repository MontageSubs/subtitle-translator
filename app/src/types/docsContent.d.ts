declare module "virtual:docs-content" {
  export interface DocPage {
    slug: string;
    category: string;
    locale: string;
    sourceLocale: string;
    title: string;
    html: string;
    isFallback: boolean;
    pinned: boolean;
    authorLogin: string | null;
    authorAvatarUrl: string | null;
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
    authorLogin: string | null;
    authorAvatarUrl: string | null;
    createdAt: string;
    updatedAt: string;
  }

  export const docPages: DocPage[];
  export const docCategories: string[];
  export const staticPages: Record<string, StaticPage[]>;
}
