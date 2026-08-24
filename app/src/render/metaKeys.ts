import { PageId } from "../router.pages";
import { TranslationKey } from "../i18n/dictionaries";

export const SITE_NAME = "Subtitle Translator";

export const TITLE_KEYS: Record<PageId, TranslationKey> = {
  nmt: "app.title",
  history: "nav.history",
  docs: "page.docs.title",
  about: "page.about.title",
  contributors: "page.contributors.title",
  discussions: "page.discussions.title",
};

export const DESCRIPTION_KEYS: Record<PageId, TranslationKey> = {
  nmt: "app.description",
  history: "meta.history.description",
  docs: "meta.docs.description",
  about: "meta.about.description",
  contributors: "meta.contributors.description",
  discussions: "meta.discussions.description",
};

export const NAV_LABEL_KEYS: Record<PageId, TranslationKey> = {
  nmt: "nav.nmt",
  history: "nav.history",
  discussions: "nav.discussions",
  docs: "nav.docs",
  contributors: "nav.contributors",
  about: "nav.about",
};
