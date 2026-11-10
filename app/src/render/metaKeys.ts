import { PAGE_IDS, PageId } from '../router/router.pages';
import { translate, TranslationKey } from "../i18n/dictionaries";
import type { LocaleCode } from "../i18n/locales.config";
import { metadata } from "../metadata";

export const BRAND_KEY: TranslationKey = "app.brand";

export const TITLE_KEYS: Record<PageId, TranslationKey> = {
  translator: BRAND_KEY,
  history: "nav.history",
  models: "nav.models",
  discussions: "page.discussions.title",
  docs: "page.docs.title",
  contribute: "page.contribute.title",
  tools: "page.tools.title",
  about: "page.about.title",
};

export interface PageMetadata {
  title: string;
  description?: string;
  keywords?: string;
}

export const pageMetadata = (locale: LocaleCode, page: PageId): PageMetadata => ({
  title: metadata(locale, `page.${page}.title`) ?? translate(locale, TITLE_KEYS[page]),
  description: metadata(locale, `page.${page}.description`),
  keywords: metadata(locale, `page.${page}.keywords`),
});

export const pageOfRoute = (route: string | undefined): PageId => PAGE_IDS.find((page) => page === route) ?? "docs";

export const ARTICLE_PAGE_IDS: ReadonlySet<PageId> = new Set<PageId>(["contribute", "tools", "about"]);

export const NAV_LABEL_KEYS: Record<PageId, TranslationKey> = {
  translator: "nav.translator",
  history: "nav.history",
  models: "nav.models",
  discussions: "nav.discussions",
  docs: "nav.docs",
  contribute: "nav.contribute",
  tools: "nav.tools",
  about: "nav.about",
};
