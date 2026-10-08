import { targetRulesFor } from "../../lib/subtitle/language/resolve";
import { mountSegmented, SegmentedHandle } from "../../components/segmented";
import { mountChoiceCards, ChoiceCardsHandle } from "../../components/choiceCards";
import { t } from "../../i18n";
import { AssFontPreset } from "../../lib/subtitle/formats/ass/template";
import { AUTO_DETECT_CODE, defaultOutputMode, } from "../../utils/languageProfiles";
import { OutputMode, BilingualStacking, CueLayout } from "../../lib/subtitle/types";
import type { WorkspaceContext } from "./context";

export interface OutputOptionsHandle {
  applyLanguageDefaults(languages: { sourceLang: string; targetLang: string }): void;
}

function segmentedChoices(entries: [string, Parameters<typeof t>[0]][]): { value: string; label: string }[] {
  return entries.map(([value, key]) => ({ value, label: t(key) }));
}

export function mountOutputOptions(ctx: WorkspaceContext): OutputOptionsHandle {
  const { state, signal } = ctx;
  const sdhToggle = ctx.query<HTMLInputElement>("#sdh-toggle");
  const musicTopAlignToggle = ctx.query<HTMLInputElement>("#music-top-align-toggle");
  const cueLayoutNote = ctx.query<HTMLElement>("#cue-layout-note");
  const presetButtons = ctx.root.querySelectorAll<HTMLButtonElement>(".ass-preset-btn");
  const customSizes = ctx.query<HTMLElement>("#ass-custom-sizes");
  const primarySizeInput = ctx.query<HTMLInputElement>("#ass-primary-size");
  const secondarySizeRow = ctx.query<HTMLElement>("#ass-secondary-size-row");
  const secondarySizeInput = ctx.query<HTMLInputElement>("#ass-secondary-size");
  const equalSizeRow = ctx.query<HTMLElement>("#ass-equal-size-row");
  const equalSizeToggle = ctx.query<HTMLInputElement>("#ass-equal-size-toggle");

  function onFormattingChanged(): void {
    syncDependentFields();
    ctx.flow.formattingChanged();
  }

  function syncDependentFields(): void {
    const bilingual = state.outputMode === "bilingual";
    stacking.setDisabled(!bilingual);
    cueLayout.setDisabled(!bilingual);
    presetButtons.forEach((button) => button.classList.toggle("ass-preset-btn--active", button.dataset.preset === state.assFontPreset));
    customSizes.hidden = state.assFontPreset !== "custom";
    equalSizeRow.hidden = !bilingual || state.cueLayout !== "single";
    secondarySizeRow.hidden = bilingual && state.assEqualBilingualSize;
  }

  const outputModeCards: ChoiceCardsHandle = mountChoiceCards(ctx.query("#output-mode-cards"), state.outputMode, (value) => {
    state.userPickedOutputMode = true;
    state.outputMode = value as OutputMode;
    syncDependentFields();
  });
  const stacking: SegmentedHandle = mountSegmented(
    ctx.query("#stacking-order"),
    segmentedChoices([["translation_top", "stacking.translationTop"], ["original_top", "stacking.originalTop"]]),
    state.stackingOrder,
    (value) => { state.stackingOrder = value as BilingualStacking; }
  );
  const cueLayout: SegmentedHandle = mountSegmented(
    ctx.query("#cue-layout"),
    segmentedChoices([["single", "cueLayout.single"], ["split", "cueLayout.split"]]),
    state.cueLayout,
    (value) => {
      state.cueLayout = value as CueLayout;
      cueLayoutNote.hidden = state.cueLayout !== "split";
      onFormattingChanged();
    }
  );

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const preset = button.dataset.preset as AssFontPreset;
      state.assFontPreset = state.assFontPreset === preset ? undefined : preset;
      onFormattingChanged();
    }, { signal });
  });
  primarySizeInput.addEventListener("input", () => {
    state.assCustomPrimarySize = Number(primarySizeInput.value) || state.assCustomPrimarySize;
    ctx.flow.formattingChanged();
  }, { signal });
  secondarySizeInput.addEventListener("input", () => {
    state.assCustomSecondarySize = Number(secondarySizeInput.value) || state.assCustomSecondarySize;
    ctx.flow.formattingChanged();
  }, { signal });
  equalSizeToggle.addEventListener("change", () => {
    state.assEqualBilingualSize = equalSizeToggle.checked;
    onFormattingChanged();
  }, { signal });

  sdhToggle.addEventListener("change", () => {
    state.sdhEnabled = sdhToggle.checked;
    ctx.task.updateHeader();
  }, { signal });
  musicTopAlignToggle.addEventListener("change", () => {
    state.musicTopAlign = musicTopAlignToggle.checked;
    state.userPickedMusicTopAlign = true;
    state.files.forEach((file) => { file.musicTopAlign = state.musicTopAlign; });
  }, { signal });

  function applyLanguageDefaults({ sourceLang, targetLang }: { sourceLang: string; targetLang: string }): void {
    if (!state.userPickedOutputMode) {
      state.outputMode = defaultOutputMode(sourceLang === AUTO_DETECT_CODE ? "en" : sourceLang, targetLang);
      outputModeCards.setValue(state.outputMode);
    }
    syncDependentFields();
    if (!state.userPickedMusicTopAlign) {
      state.musicTopAlign = targetRulesFor(targetLang).alignsMusicToTop;
      musicTopAlignToggle.checked = state.musicTopAlign;
      state.files.forEach((file) => { file.musicTopAlign = state.musicTopAlign; });
    }
  }

  syncDependentFields();

  return { applyLanguageDefaults };
}
