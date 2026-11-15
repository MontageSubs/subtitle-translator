import { loadLocaleDocs } from "../lib/docs/localeDocs";
import { getLocale } from "../i18n";
import { applyCrawlRestrictions, setArticleMeta } from "../config/head";
import type { TranslationKey } from "../i18n";
import { renderBackToList } from "../render/docsMarkup";
import { renderStaticPageBody } from "../render/staticPageMarkup";
import { previousPageId } from "../router/router";

const PLACEHOLDER_KEYS = {
  about: "page.about.placeholder",
  contribute: "page.contribute.placeholder",
  tools: "page.tools.placeholder",
} as const satisfies Record<string, TranslationKey>;

export type StaticPageId = keyof typeof PLACEHOLDER_KEYS;

export const staticPageModule = (id: StaticPageId) => ({
  async mount(container: HTMLElement, signal: AbortSignal): Promise<void> {
    const locale = getLocale();
    const { staticPages } = await loadLocaleDocs(locale);
    if (signal.aborted) return;
    const page = staticPages[id]?.find((candidate) => candidate.locale === locale);
    const backLink = previousPageId() === "docs" ? renderBackToList(locale, import.meta.env.BASE_URL, "doc-detail__back") : "";
    container.innerHTML = renderStaticPageBody(locale, page, PLACEHOLDER_KEYS[id], backLink);
    setArticleMeta({ publishedTime: page?.createdAt, modifiedTime: page?.updatedAt });
    applyCrawlRestrictions(page?.restrictions ?? []);
  },
});
