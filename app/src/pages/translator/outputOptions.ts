import { targetRulesFor } from "../../lib/subtitle/language/resolve";
import { updateHistoryJob } from "../../lib/history/history";
import { supportsPunctuationStyle } from "../../lib/subtitle/postprocess/punctuationStyle";
import { mountSegmented } from "../../components/segmented";
import { mountChoiceCards, ChoiceCardsHandle } from "../../components/choiceCards";
import { t, TranslationKey } from "../../i18n";
import { AUTO_DETECT_CODE, defaultOutputMode } from "../../utils/languageProfiles";
import { OutputMode, BilingualStacking, CueLayout } from "../../lib/subtitle/types";
import { effectiveCueLayout, isSplitLayout } from "../../lib/subtitle/formats/cueLayout";
import { mountAssSizeFields } from "./assSizeFields";
import { mountCreditToggle } from "./creditToggle";
import type { WorkspaceContext } from "./context";

export interface OutputOptionsHandle {
  sync(): void;
  applyLanguageDefaults(languages: { sourceLang: string; targetLang: string }): void;
}

function segmentedChoices(entries: [string, TranslationKey, TranslationKey][]): { value: string; label: string; title: string }[] {
  return entries.map(([value, labelKey, tipKey]) => ({ value, label: t(labelKey), title: t(tipKey) }));
}

export function mountOutputOptions(ctx: WorkspaceContext): OutputOptionsHandle {
  const { state, signal } = ctx;
  const musicTopAlignToggle = ctx.query<HTMLInputElement>("#music-top-align-toggle");
  const musicTopAlignDesc = ctx.query<HTMLElement>("#music-top-align-toggle-desc");
  const punctuationOptions = ctx.query<HTMLElement>("#punctuation-options");
  const fullWidthToggle = ctx.query<HTMLInputElement>("#full-width-punctuation-toggle");
  const keepTerminatorsToggle = ctx.query<HTMLInputElement>("#keep-terminal-punctuation-toggle");
  const assSizes = mountAssSizeFields(ctx);
  mountCreditToggle(ctx);

  function syncDependentFields(): void {
    const bilingual = state.outputMode === "bilingual";
    stacking.setDisabled(!bilingual);
    cueLayout.setDisabled(!bilingual);
    const split = isSplitLayout({ cueLayout: effectiveCueLayout(state.outputFormat, state.cueLayout), mode: state.outputMode });
    musicTopAlignToggle.disabled = split;
    musicTopAlignDesc.textContent = t(split ? "musicTopAlign.splitNote" : "musicTopAlign.desc");
    assSizes.sync();
  }

  function onFormattingChanged(): void {
    syncDependentFields();
    ctx.flow.formattingChanged();
  }

  const outputModeCards: ChoiceCardsHandle = mountChoiceCards(ctx.query("#output-mode-cards"), state.outputMode, (value) => {
    state.userPickedOutputMode = true;
    state.outputMode = value as OutputMode;
    state.files.forEach((file) => { file.renderMode = state.outputMode; });
    onFormattingChanged();
  });
  const stacking = mountSegmented(
    ctx.query("#stacking-order"),
    segmentedChoices([["translation_top", "stacking.translationTop", "tip.stackTranslation"], ["original_top", "stacking.originalTop", "tip.stackOriginal"]]),
    state.stackingOrder,
    (value) => {
      state.stackingOrder = value as BilingualStacking;
      state.files.forEach((file) => { file.stacking = state.stackingOrder; });
      onFormattingChanged();
    }
  );
  const cueLayout = mountSegmented(
    ctx.query("#cue-layout"),
    segmentedChoices([["single", "cueLayout.single", "tip.layoutSingle"], ["split", "cueLayout.split", "tip.layoutSplit"]]),
    state.cueLayout,
    (value) => {
      state.cueLayout = value as CueLayout;
      onFormattingChanged();
    }
  );

  musicTopAlignToggle.addEventListener("change", () => {
    state.musicTopAlign = musicTopAlignToggle.checked;
    state.userPickedMusicTopAlign = true;
    state.files.forEach((file) => { file.musicTopAlign = state.musicTopAlign; });
    ctx.flow.formattingChanged();
  }, { signal });

  fullWidthToggle.addEventListener("change", () => {
    state.fullWidthPunctuation = fullWidthToggle.checked;
    applyPunctuationChange();
  }, { signal });
  keepTerminatorsToggle.addEventListener("change", () => {
    state.keepTerminalPunctuation = keepTerminatorsToggle.checked;
    applyPunctuationChange();
  }, { signal });

  function applyPunctuationChange(): void {
    if (state.currentHistoryId) {
      void updateHistoryJob(state.currentHistoryId, { fullWidthPunctuation: state.fullWidthPunctuation, keepTerminalPunctuation: state.keepTerminalPunctuation }).catch(() => undefined);
    }
    ctx.flow.formattingChanged();
  }

  function applyLanguageDefaults({ sourceLang, targetLang }: { sourceLang: string; targetLang: string }): void {
    punctuationOptions.hidden = !supportsPunctuationStyle(targetLang);
    if (!state.userPickedOutputMode) {
      state.outputMode = defaultOutputMode(sourceLang === AUTO_DETECT_CODE ? "en" : sourceLang, targetLang);
      outputModeCards.setValue(state.outputMode);
      state.files.forEach((file) => { file.renderMode = state.outputMode; });
    }
    syncDependentFields();
    if (!state.userPickedMusicTopAlign) {
      state.musicTopAlign = targetRulesFor(targetLang).alignsMusicToTop;
      musicTopAlignToggle.checked = state.musicTopAlign;
      state.files.forEach((file) => { file.musicTopAlign = state.musicTopAlign; });
    }
    ctx.flow.formattingChanged();
  }

  syncDependentFields();

  return { sync: syncDependentFields, applyLanguageDefaults };
}
