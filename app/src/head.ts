import { PageId } from "./router";
import { t } from "./i18n";
import { TITLE_KEYS, DESCRIPTION_KEYS, BRAND_KEY } from "./render/metaKeys";

function setMetaByAttr(attr: "name" | "property", key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setRobotsMeta(content: string | null): void {
  const existing = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (content === null) { existing?.remove(); return; }
  setMetaByAttr("name", "robots", content);
}

export function setPageMeta(title: string, description: string): void {
  document.title = `${title} · ${t(BRAND_KEY)}`;
  setMetaByAttr("name", "description", description);
  setMetaByAttr("property", "og:title", document.title);
  setMetaByAttr("property", "og:description", description);
}

export function applyPageMeta(page: PageId): void {
  setPageMeta(t(TITLE_KEYS[page]), t(DESCRIPTION_KEYS[page]));
  setRobotsMeta(page === "history" ? "noindex" : null);
}
