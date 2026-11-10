import { PageId } from '../router/router';
import { CHANNEL } from './channel';
import { robotsDirectives } from './robots';
import { isoTimestampOf } from './documentTime';
import { getLocale, t } from '../i18n';
import { BRAND_KEY, ARTICLE_PAGE_IDS, pageMetadata } from '../render/metaKeys';
import { composeDocumentTitle } from '../render/documentTitle';
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

export function setPageMeta(title: string, description?: string): void {
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
  const meta = pageMetadata(getLocale(), page);
  setPageMeta(page === HOME_PAGE_ID && isInstalledApp() ? t(BRAND_KEY) : meta.title, meta.description);
  setMetaByAttr("name", "keywords", meta.keywords);
  setArticleMeta(ARTICLE_PAGE_IDS.has(page) ? {} : undefined);
  applyCrawlRestrictions(PAGE_CRAWL_RESTRICTIONS[page] ?? []);
}
