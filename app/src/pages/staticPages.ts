import { staticPages } from "virtual:docs-content";
import { getLocale } from "../i18n";
import type { TranslationKey } from "../i18n";
import { renderStaticPageBody } from "../render/staticPageMarkup";

const PLACEHOLDER_KEYS = {
  about: "page.about.placeholder",
  contribute: "page.contribute.placeholder",
  tools: "page.tools.placeholder",
} as const satisfies Record<string, TranslationKey>;

export type StaticPageId = keyof typeof PLACEHOLDER_KEYS;

export const staticPageModule = (id: StaticPageId) => ({
  mount(container: HTMLElement): void {
    const locale = getLocale();
    container.innerHTML = renderStaticPageBody(locale, staticPages[id]?.find((page) => page.locale === locale), PLACEHOLDER_KEYS[id]);
  },
});
