declare module "virtual:docs-content" {
  export interface DocPage {
    slug: string;
    category: string;
    locale: string;
    title: string;
    html: string;
    isFallback: boolean;
  }

  export const docPages: DocPage[];
  export const docCategories: string[];
}
