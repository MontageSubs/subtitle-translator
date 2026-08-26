import { PageId } from "../router.pages";
import { LocaleCode } from "../i18n/locales.config";
import { translate } from "../i18n/dictionaries";
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
        <div class="discussions-fallback" style="margin-top: 16px;">
          <p class="discussions-fallback__desc">${translate(locale, "discussions.nojs.desc")}</p>
          <div class="discussions-fallback__actions">
            <a class="primary" href="${GITHUB_DISCUSSIONS_URL}" target="_blank" rel="noopener">${translate(locale, "discussions.fallback.action")}</a>
          </div>
        </div>
      </section>
    `;
  }

  if (page === "history") {
    return `
      <section class="step">
        <div class="history-page-header">
          <h1 class="history-page-title">${title}</h1>
        </div>
        <div class="js-required" style="padding: 2rem 0; text-align: center;">
          <p class="js-required__title" style="font-weight: 600; margin-bottom: 0.5rem; color: var(--danger);">${translate(locale, "js.required.title")}</p>
          <p class="muted" style="margin: 0;">${translate(locale, "js.required.body")}</p>
        </div>
      </section>
    `;
  }

  let extraHtml = "";
  if (page === "nmt") {
    extraHtml = `
    <section class="step features-grid">
      <div class="feature-item">
        <div class="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        </div>
        <h3>${translate(locale, "app.feature.1.title")}</h3>
        <p>${translate(locale, "app.feature.1.desc")}</p>
      </div>
      <div class="feature-item">
        <div class="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        </div>
        <h3>${translate(locale, "app.feature.2.title")}</h3>
        <p>${translate(locale, "app.feature.2.desc")}</p>
      </div>
      <div class="feature-item">
        <div class="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
        </div>
        <h3>${translate(locale, "app.feature.3.title")}</h3>
        <p>${translate(locale, "app.feature.3.desc")}</p>
      </div>
    </section>
    `;
  }

  return `
    <header class="tool-header">
      <h1>${title}</h1>
      ${page === 'nmt' ? `<p class="seo-about__tagline" style="color: var(--muted); margin-bottom: 2rem; text-align: left;">${translate(locale, "app.tagline")}</p>` : ''}
    </header>
    <section class="step js-required" style="background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 2rem; text-align: center; margin-bottom: 2rem;">
      <p class="js-required__title" style="font-weight: 600; margin-bottom: 0.5rem; color: var(--danger);">${translate(locale, "js.required.title")}</p>
      <p class="muted" style="margin: 0;">${translate(locale, "js.required.body")}</p>
    </section>
    ${extraHtml}
  `;
}
