import { staticPages } from "virtual:docs-content";
import { getLocale } from "../i18n";
import { renderStaticPageBody } from "../render/staticPageMarkup";

export function mount(container: HTMLElement, _signal: AbortSignal): void {
  const locale = getLocale();
  const page = staticPages.apps?.find((p) => p.locale === locale);
  container.innerHTML = renderStaticPageBody(locale, page, "page.apps.placeholder");
}
