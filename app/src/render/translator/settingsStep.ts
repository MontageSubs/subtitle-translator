import { t, LocaleCode } from "../../i18n";
import { CONTEXT_MAX_CHARS } from "../../utils/context";
import { renderContextInput } from "../../components/contextInput";
import { SCENE_SECONDS_MIN, SCENE_SECONDS_MAX, SCENE_SLIDER_MIN, SCENE_SLIDER_MAX } from "../../components/sceneSplitField";
import { renderDirectionArrow } from "../icons";
import { renderModelCards } from "./modelCards";

export interface SettingsStepInput {
  locale: LocaleCode;
  visible: boolean;
  caseSensitiveTerms: boolean;
  sceneSeconds: number;
  contextLength: number;
  sdhEnabled: boolean;
  musicTopAlign: boolean;
  cueLayoutSplit: boolean;
  assCustomPrimarySize: number;
  assCustomSecondarySize: number;
  assEqualBilingualSize: boolean;
}

function renderToggleRow(id: string, labelKey: "caseSensitiveTerms.label" | "sdh.label" | "musicTopAlign.label", descKey: "caseSensitiveTerms.desc" | "sdh.desc" | "musicTopAlign.desc", checked: boolean, compact = false): string {
  return `
      <div class="toggle-row${compact ? " toggle-row--compact" : ""}">
        <div>
          <div class="toggle-row__label">${t(labelKey)}</div>
          <div class="toggle-row__desc">${t(descKey)}</div>
        </div>
        <label class="switch"><input type="checkbox" id="${id}" ${checked ? "checked" : ""} /><span class="switch__track"></span></label>
      </div>`;
}

function renderLanguageSelect(fieldKey: "field.sourceLang" | "field.targetLang", prefix: "source" | "target"): string {
  return `
        <div class="field">
          <span id="${prefix}-lang-label">${t(fieldKey)}</span>
          <select id="${prefix}-lang" class="sr-only-select" tabindex="-1" aria-hidden="true"></select>
          <div class="lang-combo" id="${prefix}-lang-combo"></div>
        </div>`;
}

function renderLanguageFields(): string {
  return `
      <div class="field-row field-row--lang">${renderLanguageSelect("field.sourceLang", "source")}
        <div class="lang-flow-arrow" aria-hidden="true">
          ${renderDirectionArrow(16)}
        </div>${renderLanguageSelect("field.targetLang", "target")}
      </div>`;
}

function renderAssistFields(input: SettingsStepInput): string {
  const clampedSlider = Math.min(SCENE_SLIDER_MAX, Math.max(SCENE_SLIDER_MIN, input.sceneSeconds));
  return `
      <div class="field-divider">${t("step.assist.title")}</div>
      <div id="glossary-editor"></div>${renderToggleRow("case-sensitive-toggle", "caseSensitiveTerms.label", "caseSensitiveTerms.desc", input.caseSensitiveTerms, true)}
      <div class="field slider-field">
        <div class="slider-field__row">
          <span>${t("scene.label")}</span>
          <input type="number" id="scene-seconds-number" class="slider-field__number" min="${SCENE_SECONDS_MIN}" max="${SCENE_SECONDS_MAX}" value="${input.sceneSeconds}" />
        </div>
        <input type="range" id="scene-seconds" min="${SCENE_SLIDER_MIN}" max="${SCENE_SLIDER_MAX}" step="1" value="${clampedSlider}" />
        <div class="slider-field__hint" id="scene-preview-hint">${t("scene.hint")}</div>
      </div>
      <div class="field field--context">
        <div class="field__header">
          <label for="context-input">${t("context.label")}</label>
          <button type="button" class="action-pill" id="context-history-import">${t("history.import")}</button>
        </div>
        <p class="field__desc" id="context-desc">${t("context.desc")}</p>
        ${renderContextInput("context-input", "context-clear", 3)}
        <span class="field__counter" id="context-counter">${input.contextLength}/${CONTEXT_MAX_CHARS}</span>
        <div class="slider-field__hint" id="context-hint"></div>
      </div>`;
}

function renderProcessingOptions(input: SettingsStepInput): string {
  return `
      <div class="field-divider">${t("step.options.title")}</div>${renderToggleRow("sdh-toggle", "sdh.label", "sdh.desc", input.sdhEnabled)}${renderToggleRow("music-top-align-toggle", "musicTopAlign.label", "musicTopAlign.desc", input.musicTopAlign)}`;
}

function renderOutputFields(input: SettingsStepInput): string {
  return `
      <div class="field-divider">${t("step.output.title")}</div>
      <div class="field" id="output-mode-field">
        <div class="choice-cards" id="output-mode-cards" role="radiogroup" aria-label="${t("field.outputMode")}">
          <button type="button" class="choice-card" data-value="monolingual" role="radio" aria-checked="false">
            <span class="choice-card__title">${t("outputMode.monolingual")}</span>
            <p class="choice-card__desc">${t("outputMode.monolingualDesc")}</p>
          </button>
          <button type="button" class="choice-card" data-value="bilingual" role="radio" aria-checked="false">
            <span class="choice-card__title">${t("outputMode.bilingual")}</span>
            <p class="choice-card__desc">${t("outputMode.bilingualDesc")}</p>
          </button>
        </div>
      </div>
      <div class="field-row">
        <div class="field" id="stacking-field">
          <span>${t("field.stacking")}</span>
          <div class="segmented" id="stacking-order" role="group" aria-label="${t("field.stacking")}"></div>
        </div>
        <div class="field" id="cue-layout-field">
          <span>${t("field.cueLayout")}</span>
          <div class="segmented" id="cue-layout" role="group" aria-label="${t("field.cueLayout")}"></div>
          <p class="field__desc field__desc--small" id="cue-layout-note" ${input.cueLayoutSplit ? "" : "hidden"}>${t("cueLayout.splitFormatNote")}</p>
        </div>
      </div>
      <div class="field" id="ass-options-row">
        <span>${t("ass.templateLabel")}</span>
        <div class="ass-options__presets">
          <button type="button" class="ass-preset-btn" data-preset="desktop">${t("ass.preset.desktop")}</button>
          <button type="button" class="ass-preset-btn" data-preset="mobile">${t("ass.preset.mobile")}</button>
          <button type="button" class="ass-preset-btn" data-preset="custom">${t("ass.preset.custom")}</button>
        </div>
        <div class="ass-options__custom" id="ass-custom-sizes" hidden>
          <label>${t("ass.primarySize")} <input type="number" id="ass-primary-size" min="8" max="200" value="${input.assCustomPrimarySize}" /></label>
          <label id="ass-secondary-size-row"><span>${t("ass.secondarySize")}</span> <input type="number" id="ass-secondary-size" min="8" max="200" value="${input.assCustomSecondarySize}" /></label>
        </div>
        <label class="ass-options__equal-size" id="ass-equal-size-row" hidden>
          <input type="checkbox" id="ass-equal-size-toggle" ${input.assEqualBilingualSize ? "checked" : ""} />
          <span>${t("ass.equalSize")}</span>
        </label>
        <p class="field__desc field__desc--small">${t("ass.formatNote")}</p>
      </div>`;
}

export function renderSettingsStep(input: SettingsStepInput): string {
  return `
    <section class="step" id="lang-step" ${input.visible ? "" : "hidden"}>
      <div class="step__head">
        <span class="step__num">2</span>
        <span class="step__title">${t("step.lang.title")}</span>
      </div>${renderModelCards(input.locale)}${renderLanguageFields()}${renderAssistFields(input)}${renderProcessingOptions(input)}${renderOutputFields(input)}
    </section>`;
}
