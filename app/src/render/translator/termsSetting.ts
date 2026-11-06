import { tipAttr } from "../../utils/labelAttrs";
import { t } from "../../i18n";
import { CONTEXT_MAX_CHARS } from "../../utils/context";
import { renderContextInput } from "../../components/contextInput";
import { renderSetting } from "./setting";
import { renderToggleRow } from "./settingFields";

export interface TermsSettingInput {
  contextLength: number;
  caseSensitiveTerms: boolean;
  perSubtitle: boolean;
}

function renderGlossaryOptions(caseSensitiveTerms: boolean): string {
  return `<div class="glossary__options">${renderToggleRow("glossary-case-sensitive-toggle", "glossary.caseSensitive.label", "glossary.caseSensitive.desc", caseSensitiveTerms)}
        </div>`;
}

function renderGlossaryField(caseSensitiveTerms: boolean, perSubtitle: boolean): string {
  return `
      <div class="field field--spaced" role="group" aria-labelledby="terms-title">
        <div id="per-subtitle-setting" hidden>${renderToggleRow("per-subtitle-toggle", "terms.scope.label", "terms.scope.desc", perSubtitle)}
        </div>
        <div class="scope-switcher" id="glossary-switcher" role="group" hidden></div>
        <div id="glossary-editor"></div>${renderGlossaryOptions(caseSensitiveTerms)}
      </div>`;
}

function renderContextField(contextLength: number): string {
  return `
      <div class="field field--context">
        <div class="scope-switcher" id="context-switcher" role="group" hidden></div>
        <label for="context-input">${t("context.label")}</label>
        <p class="field__desc" id="context-desc">${t("context.desc")}</p>
        ${renderContextInput("context-input", "context-clear", 3)}
        <div class="field__footer">
          <button type="button" class="action-pill" id="context-history-import" ${tipAttr(t("tip.importContext"))}>${t("field.importFromHistory")}</button>
          <span class="field__counter" id="context-counter">${contextLength}/${CONTEXT_MAX_CHARS}</span>
        </div>
        <div class="slider-field__hint" id="context-hint" aria-live="polite"></div>
      </div>`;
}

export function renderTermsSetting({ contextLength, caseSensitiveTerms, perSubtitle }: TermsSettingInput): string {
  return renderSetting({
    id: "terms",
    title: t("setting.terms.title"),
    primary: renderGlossaryField(caseSensitiveTerms, perSubtitle),
    more: renderContextField(contextLength),
    moreOpen: contextLength > 0,
  });
}
