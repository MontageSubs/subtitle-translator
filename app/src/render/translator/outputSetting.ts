import { getLocale, t } from "../../i18n";
import { buildPath } from "../../router/router";
import { renderSetting } from "./setting";
import { renderNumberField, renderSegmentedField, renderToggleRow } from "./settingFields";

export interface OutputSettingInput {
  musicTopAlign: boolean;
  fullWidthPunctuation: boolean;
  keepTerminalPunctuation: boolean;
  chinesePunctuationVisible: boolean;
  creditEnabled: boolean;
  assCustomPrimarySize: number;
  assCustomSecondarySize: number;
  assEqualBilingualSize: boolean;
}

function renderModeCard(mode: "monolingual" | "bilingual"): string {
  return `
          <button type="button" class="choice-card" data-value="${mode}" role="radio" aria-checked="false">
            <span class="choice-card__title">${t(`outputMode.${mode}`)}</span>
            <span class="choice-card__desc">${t(`outputMode.${mode}Desc`)}</span>
          </button>`;
}

function renderModeCards(): string {
  return `
        <div class="choice-cards" id="output-mode-cards" role="radiogroup" aria-labelledby="output-title">${renderModeCard("bilingual")}${renderModeCard("monolingual")}
        </div>${renderSegmentedField("stacking-order", "field.stacking", "stacking.note")}`;
}

function renderAssOptions(input: OutputSettingInput): string {
  return `${renderSegmentedField("ass-size", "ass.sizeLabel", "ass.sizeNote")}
        <div class="field-row">${renderNumberField("ass-primary-size", "ass.primarySize", input.assCustomPrimarySize)}${renderNumberField("ass-secondary-size", "ass.secondarySize", input.assCustomSecondarySize)}
        </div>${renderToggleRow("ass-equal-size-toggle", "ass.equalSize", "ass.equalSizeDesc", input.assEqualBilingualSize)}`;
}

function renderPunctuationOptions(input: OutputSettingInput): string {
  return `
        <div class="toggle-group" id="chinese-punctuation-options"${input.chinesePunctuationVisible ? "" : " hidden"}>${renderToggleRow("full-width-punctuation-toggle", "punctuation.fullWidth.label", "punctuation.fullWidth.desc", input.fullWidthPunctuation)}${renderToggleRow("keep-terminal-punctuation-toggle", "punctuation.terminators.label", "punctuation.terminators.desc", input.keepTerminalPunctuation)}
        </div>`;
}

export function renderOutputSetting(input: OutputSettingInput): string {
  return renderSetting({
    id: "output",
    title: t("field.outputMode"),
    primary: renderModeCards(),
    more: `${renderSegmentedField("cue-layout", "field.cueLayout", "cueLayout.note")}${renderToggleRow("music-top-align-toggle", "musicTopAlign.label", "musicTopAlign.desc", input.musicTopAlign)}${renderPunctuationOptions(input)}${renderToggleRow("credit-toggle", "credit.label", "credit.desc", input.creditEnabled, "credit", { href: buildPath(getLocale(), "contribute"), text: t("credit.learnMore") })}${renderAssOptions(input)}`,
  });
}
