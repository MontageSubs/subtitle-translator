import { t } from "../../i18n";
import { renderDirectionArrow } from "../icons";
import { renderSetting } from "./setting";

function renderLanguageSelect(fieldKey: "field.sourceLang" | "field.targetLang", prefix: "source" | "target"): string {
  return `
        <div class="field">
          <span id="${prefix}-lang-label">${t(fieldKey)}</span>
          <select id="${prefix}-lang" class="sr-only-select" tabindex="-1" aria-hidden="true" aria-labelledby="${prefix}-lang-label"></select>
          <div class="lang-combo" id="${prefix}-lang-combo"></div>
        </div>`;
}

export function renderLanguageSetting(): string {
  return renderSetting({
    id: "languages",
    title: t("setting.languages.title"),
    primary: `
      <div class="field-row field-row--lang">${renderLanguageSelect("field.sourceLang", "source")}
        <div class="lang-flow-arrow" aria-hidden="true">
          ${renderDirectionArrow(16)}
        </div>${renderLanguageSelect("field.targetLang", "target")}
      </div>`,
  });
}
