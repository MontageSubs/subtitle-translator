import { HOME_PAGE_ID, routePath } from "./paths";
import { renderDiscussionsFallback } from "./discussionsMarkup";
import { PageId } from '../router/router.pages';
import { LocaleCode } from "../i18n/locales.config";
import { translate, TranslationKey, translateHtml } from "../i18n/dictionaries";
import { renderTranslatorHeader, renderTranslatorHost, renderTranslatorUploadStep, renderTranslatorFeatures } from "./translator/intro";
import { TITLE_KEYS } from "./metaKeys";


export function renderJsRequiredBody(locale: LocaleCode, page: PageId, basePath: string): string {
  const title = translate(locale, TITLE_KEYS[page]);

  if (page === "discussions") {
    const fallback = renderDiscussionsFallback({ locale, communityHref: routePath(basePath, [locale, "docs", "community"]), messageKey: "discussions.nojs.desc", retryable: false });
    return `
      <section class="step">
        <div class="page-header">
          <h1 class="page-title">${title}</h1>
        </div>
        <noscript>${fallback}</noscript>
      </section>
    `;
  }

  if (page === "history" || page === "models") {
    return `
      <section class="step">
        <div class="page-header">
          <h1 class="page-title">${title}</h1>
        </div>
        <noscript>
          <div class="status-panel status-panel--compact">
            <h2 class="status-panel__title">${translateHtml(locale, "js.required.title")}</h2>
            <p class="muted">${translateHtml(locale, "js.required.body")}</p>
          </div>
        </noscript>
      </section>
    `;
  }

  if (page === HOME_PAGE_ID) {
    const tr = (key: TranslationKey) => translate(locale, key);
    return renderTranslatorHost(`
    ${renderTranslatorHeader(tr)}
    ${renderJsRequiredNotice(locale)}
    ${renderTranslatorUploadStep(tr, false)}
    ${renderTranslatorFeatures(tr, false)}
  `);
  }

  return `
    <header class="tool-header">
      <h1>${title}</h1>
    </header>
    ${renderJsRequiredNotice(locale)}
  `;
}

function renderJsRequiredNotice(locale: LocaleCode): string {
  return `<noscript>
      <section class="step status-panel status-panel--boxed">
        <h2 class="status-panel__title">${translateHtml(locale, "js.required.title")}</h2>
        <p class="muted">${translateHtml(locale, "js.required.body")}</p>
      </section>
    </noscript>`;
}
