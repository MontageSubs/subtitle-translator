import { t, LocaleCode } from "../../i18n";
import { renderLanguageSetting } from "./languageSetting";
import { renderEngineSetting } from "./engineSetting";
import { renderTermsSetting, TermsSettingInput } from "./termsSetting";
import { renderSourceSetting, SourceSettingInput } from "./sourceSetting";
import { renderOutputSetting, OutputSettingInput } from "./outputSetting";

export interface SettingsStepInput extends TermsSettingInput, SourceSettingInput, OutputSettingInput {
  locale: LocaleCode;
  visible: boolean;
}

export function renderSettingsStep(input: SettingsStepInput): string {
  return `
    <section class="step" id="lang-step" aria-labelledby="lang-step-title"${input.visible ? "" : " hidden"}>
      <div class="step__head">
        <span class="step__num">2</span>
        <h2 class="step__title" id="lang-step-title">${t("step.lang.title")}</h2>
      </div>${renderEngineSetting(input.locale)}${renderLanguageSetting()}${renderTermsSetting(input)}${renderSourceSetting(input)}${renderOutputSetting(input)}
    </section>`;
}
