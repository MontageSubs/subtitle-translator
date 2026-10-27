import { PageId } from '../router/router.pages';
import { TranslationKey } from "../i18n/dictionaries";

export const BRAND_KEY: TranslationKey = "brand.name";

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

