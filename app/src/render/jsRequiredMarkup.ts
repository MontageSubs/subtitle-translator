import { HOME_PAGE_ID } from "./paths";
import { renderExternalLinkIcon } from "./icons";
import { PageId } from '../router/router.pages';
import { LocaleCode } from "../i18n/locales.config";
import { translate, TranslationKey } from "../i18n/dictionaries";
import { renderTranslatorHeader, renderTranslatorHost, renderTranslatorUploadStep, renderTranslatorFeatures } from "./translator/intro";
import { TITLE_KEYS } from "./metaKeys";

const GITHUB_DISCUSSIONS_URL = "https://github.com/MontageSubs/subtitle-translator/discussions";

export function renderJsRequiredBody(locale: LocaleCode, page: PageId): string {
  const title = translate(locale, TITLE_KEYS[page]);

  if (page === "discussions") {
    return `
      <section class="step">
        <div class="step__head">
          <h1>${title}</h1>
        </div>
        <noscript>
          <div class="discussions-fallback">
            <p class="discussions-fallback__desc">${translate(locale, "discussions.nojs.desc")}</p>
            <div class="discussions-fallback__actions">
              <a class="primary" href="${GITHUB_DISCUSSIONS_URL}" target="_blank" rel="noopener">${translate(locale, "discussions.fallback.action")}${renderExternalLinkIcon(translate(locale, "a11y.opensInNewTab"))}</a>
            </div>
          </div>
        </noscript>
      </section>
    `;
  }

  if (page === "history") {
    return `
      <section class="step">
        <div class="history-page-header">
          <h1 class="history-page-title">${title}</h1>
        </div>
        <noscript>
          <div class="js-required js-required--compact">
            <p class="js-required__title">${translate(locale, "js.required.title")}</p>
            <p class="muted">${translate(locale, "js.required.body")}</p>
          </div>
        </noscript>
      </section>
    `;
  }

  if (page === "models") {
    return `
      <section class="step models-page">
        <div class="history-page-header models-page__header">
          <h1 class="history-page-title">${title}</h1>
        </div>
        <p class="history-page-subtitle">${translate(locale, "models.subtitle")}</p>
        <noscript>
          <div class="history-list models-list">
            <div class="history-row model-row">
              <div class="history-row__main model-row__main">
                <div class="history-row__info">
                  <div class="history-row__name"><span class="history-row__title">${translate(locale, "js.required.title")}</span></div>
                  <div class="history-row__meta">${translate(locale, "js.required.body")}</div>
                </div>
              </div>
            </div>
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
      <section class="step js-required js-required--boxed">
        <p class="js-required__title">${translate(locale, "js.required.title")}</p>
        <p class="muted">${translate(locale, "js.required.body")}</p>
      </section>
    </noscript>`;
}
