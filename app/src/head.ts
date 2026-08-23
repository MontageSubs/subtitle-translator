import { PageId } from "./router";
import { TranslationKey, t } from "./i18n";

const SITE_NAME = "Subtitle Translator";

const TITLE_KEYS: Record<PageId, TranslationKey> = {
  nmt: "app.title",
  docs: "page.docs.title",
  about: "page.about.title",
  contributors: "page.contributors.title",
  discussions: "page.discussions.title",
};

const DESCRIPTION_KEYS: Record<PageId, TranslationKey> = {
  nmt: "app.description",
  docs: "meta.docs.description",
  about: "meta.about.description",
  contributors: "meta.contributors.description",
  discussions: "meta.discussions.description",
};

function setMetaByAttr(attr: "name" | "property", key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function setPageMeta(title: string, description: string): void {
  document.title = `${title} · ${SITE_NAME}`;
  setMetaByAttr("name", "description", description);
  setMetaByAttr("property", "og:title", document.title);
  setMetaByAttr("property", "og:description", description);
}

export function applyPageMeta(page: PageId): void {
  setPageMeta(t(TITLE_KEYS[page]), t(DESCRIPTION_KEYS[page]));
}
