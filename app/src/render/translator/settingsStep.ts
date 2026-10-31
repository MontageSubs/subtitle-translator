import { t, LocaleCode } from "../../i18n";
import { renderDirectionArrow } from "../icons";
import { renderModelCards } from "./engineCards";
import { renderSetting } from "./setting";
import { renderTermsSetting, TermsSettingInput } from "./termsSetting";
import { renderSourceSetting, SourceSettingInput } from "./sourceSetting";
import { renderOutputSetting, OutputSettingInput } from "./outputSetting";

function renderLanguageSelect(fieldKey: "field.sourceLang" | "field.targetLang", prefix: "source" | "target"): string {
  return `
        <div class="field">
          <span id="${prefix}-lang-label">${t(fieldKey)}</span>
          <select id="${prefix}-lang" class="sr-only-select" tabindex="-1" aria-hidden="true" aria-labelledby="${prefix}-lang-label"></select>
          <div class="lang-combo" id="${prefix}-lang-combo"></div>
        </div>`;
}

function renderLanguageSetting(): string {
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

function renderEngineSetting(locale: LocaleCode): string {
  return renderSetting({ id: "engine", title: t("field.engine"), primary: renderModelCards(locale) });
}

export interface SettingsStepInput extends TermsSettingInput, SourceSettingInput, OutputSettingInput {
  locale: LocaleCode;
  visible: boolean;
}

export function renderSettingsStep(input: SettingsStepInput): string {
  return `
    <section class="step" id="lang-step" aria-labelledby="lang-step-title"${input.visible ? "" : " hidden"}>
      <div class="step__head">
        <span class="step__num">2</span>
        <h2 class="step__title" id="lang-step-title">${t("step.settings.title")}</h2>
      </div>${renderEngineSetting(input.locale)}${renderLanguageSetting()}${renderTermsSetting(input)}${renderSourceSetting(input)}${renderOutputSetting(input)}
    </section>`;
}
