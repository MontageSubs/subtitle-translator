import { PageId } from "../router.pages";
import { TranslationKey } from "../i18n/dictionaries";

export const BRAND_KEY: TranslationKey = "brand.name";

export const TITLE_KEYS: Record<PageId, TranslationKey> = {
  nmt: "app.title",
  history: "nav.history",
  discussions: "page.discussions.title",
  docs: "page.docs.title",
  contribute: "page.contribute.title",
  apps: "page.apps.title",
  about: "page.about.title",
};

export const DESCRIPTION_KEYS: Record<PageId, TranslationKey> = {
  nmt: "app.tagline",
  history: "meta.history.description",
  discussions: "meta.discussions.description",
  docs: "meta.docs.description",
  contribute: "meta.contribute.description",
  apps: "meta.apps.description",
  about: "meta.about.description",
};

export const NAV_LABEL_KEYS: Record<PageId, TranslationKey> = {
  nmt: "nav.nmt",
  history: "nav.history",
  discussions: "nav.discussions",
  docs: "nav.docs",
  contribute: "nav.contribute",
  apps: "nav.apps",
  about: "nav.about",
};

