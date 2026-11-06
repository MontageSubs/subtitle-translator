import { PageId } from '../router/router';
import { CHANNEL } from './channel';
import { robotsDirectives } from './robots';
import { isoTimestampOf } from './documentTime';
import { t } from '../i18n';
import { TITLE_KEYS, DESCRIPTION_KEYS, BRAND_KEY, ARTICLE_PAGE_IDS, composeDocumentTitle } from '../render/metaKeys';
import type { ArticleTimes } from '../render/shareMeta';

type MetaAttribute = "name" | "property";

function setMetaByAttr(attr: MetaAttribute, key: string, content: string | undefined): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === undefined) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function setPageMeta(title: string, description: string): void {
  document.title = composeDocumentTitle(title, t(BRAND_KEY));
  setMetaByAttr("name", "description", description);
  setMetaByAttr("property", "og:title", document.title);
  setMetaByAttr("property", "og:description", description);
  setMetaByAttr("name", "twitter:title", document.title);
  setMetaByAttr("name", "twitter:description", description);
}

export function setArticleMeta(article?: ArticleTimes): void {
  setMetaByAttr("property", "og:type", article ? "article" : "website");
  setMetaByAttr("property", "article:published_time", isoTimestampOf(article?.publishedTime));
  setMetaByAttr("property", "article:modified_time", isoTimestampOf(article?.modifiedTime));
}

export function applyPageMeta(page: PageId): void {
  setPageMeta(t(TITLE_KEYS[page]), t(DESCRIPTION_KEYS[page]));
  setArticleMeta(ARTICLE_PAGE_IDS.has(page) ? {} : undefined);
  setMetaByAttr("name", "robots", robotsDirectives(CHANNEL.indexable && page !== "history"));
}
