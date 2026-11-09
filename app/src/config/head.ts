import { PageId } from '../router/router';
import { CHANNEL } from './channel';
import { robotsDirectives } from './robots';
import { isoTimestampOf } from './documentTime';
import { t } from '../i18n';
import { DOCUMENT_TITLE_KEYS, DESCRIPTION_KEYS, KEYWORD_KEYS, BRAND_KEY, ARTICLE_PAGE_IDS, composeDocumentTitle } from '../render/metaKeys';
import { PAGE_CRAWL_RESTRICTIONS, type CrawlRestriction } from './crawlPolicy';
import { HOME_PAGE_ID } from '../render/paths';
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

const isInstalledApp = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function applyCrawlRestrictions(restrictions: readonly CrawlRestriction[]): void {
  setMetaByAttr("name", "robots", robotsDirectives(CHANNEL.indexable, restrictions));
}

export function applyPageMeta(page: PageId): void {
  const titleKey = page === HOME_PAGE_ID && isInstalledApp() ? BRAND_KEY : DOCUMENT_TITLE_KEYS[page];
  setPageMeta(t(titleKey), t(DESCRIPTION_KEYS[page]));
  setMetaByAttr("name", "keywords", t(KEYWORD_KEYS[page]));
  setArticleMeta(ARTICLE_PAGE_IDS.has(page) ? {} : undefined);
  applyCrawlRestrictions(PAGE_CRAWL_RESTRICTIONS[page] ?? []);
}
