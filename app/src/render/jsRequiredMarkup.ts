import { PageId } from "../router.pages";
import { LocaleCode } from "../i18n/locales.config";
import { translate } from "../i18n/dictionaries";
import { TITLE_KEYS } from "./metaKeys";

export function renderJsRequiredBody(locale: LocaleCode, page: PageId): string {
  const title = translate(locale, TITLE_KEYS[page]);
  return `
    <section class="step js-required">
      <h1>${title}</h1>
      <p class="js-required__title">${translate(locale, "js.required.title")}</p>
      <p class="muted">${translate(locale, "js.required.body")}</p>
    </section>
  `;
}
