import { PageId } from '../router/router.pages';
import { TranslationKey } from "../i18n/dictionaries";

export const BRAND_KEY: TranslationKey = "app.brand";

export const composeDocumentTitle = (pageTitle: string, brand: string): string =>
  pageTitle.includes(brand) ? pageTitle : `${pageTitle} · ${brand}`;

export const TITLE_KEYS: Record<PageId, TranslationKey> = {
  translator: "app.homeTitle",
  history: "nav.history",
  models: "nav.models",
  discussions: "page.discussions.title",
  docs: "page.docs.title",
  contribute: "page.contribute.title",
  tools: "page.tools.title",
  about: "page.about.title",
};

export const DOCUMENT_TITLE_KEYS: Record<PageId, TranslationKey> = {
  ...TITLE_KEYS,
  models: "meta.models.title",
  docs: "meta.docs.title",
  tools: "meta.tools.title",
};

export const DESCRIPTION_KEYS: Record<PageId, TranslationKey> = {
  translator: "meta.translator.description",
  history: "meta.history.description",
  models: "meta.models.description",
  discussions: "meta.discussions.description",
  docs: "meta.docs.description",
  contribute: "meta.contribute.description",
  tools: "meta.tools.description",
  about: "meta.about.description",
};

export const KEYWORD_KEYS: Record<PageId, TranslationKey> = {
  translator: "meta.translator.keywords",
  history: "meta.history.keywords",
  models: "meta.models.keywords",
  discussions: "meta.discussions.keywords",
  docs: "meta.docs.keywords",
  contribute: "meta.contribute.keywords",
  tools: "meta.tools.keywords",
  about: "meta.about.keywords",
};

export const keywordKeyOfRoute = (route: string | undefined): TranslationKey =>
  KEYWORD_KEYS[(route && route in KEYWORD_KEYS ? route : "docs") as PageId];

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

