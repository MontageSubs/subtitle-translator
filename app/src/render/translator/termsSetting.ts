import { t } from "../../i18n";
import { CONTEXT_MAX_CHARS } from "../../utils/context";
import { renderContextInput } from "../../components/contextInput";
import { renderSetting } from "./setting";
import { renderToggleRow } from "./settingFields";

export interface TermsSettingInput {
  contextLength: number;
  caseSensitiveTerms: boolean;
}

function renderGlossaryField(caseSensitiveTerms: boolean): string {
  return `
      <div class="field field--spaced" role="group" aria-labelledby="terms-title">
        <div id="glossary-editor"></div>${renderToggleRow("case-sensitive-toggle", "caseSensitiveTerms.label", "caseSensitiveTerms.desc", caseSensitiveTerms)}
      </div>`;
}

function renderContextField(contextLength: number): string {
  return `
      <div class="field field--context">
        <label for="context-input">${t("context.label")}</label>
        <p class="field__desc" id="context-desc">${t("context.desc")}</p>
        ${renderContextInput("context-input", "context-clear", 3)}
        <div class="field__footer">
          <button type="button" class="action-pill" id="context-history-import">${t("field.importFromHistory")}</button>
          <span class="field__counter" id="context-counter">${contextLength}/${CONTEXT_MAX_CHARS}</span>
        </div>
        <div class="slider-field__hint" id="context-hint" aria-live="polite"></div>
      </div>`;
}

export function renderTermsSetting({ contextLength, caseSensitiveTerms }: TermsSettingInput): string {
  return renderSetting({
    id: "terms",
    title: t("setting.terms.title"),
    primary: renderGlossaryField(caseSensitiveTerms),
    more: renderContextField(contextLength),
    moreOpen: contextLength > 0,
  });
}
