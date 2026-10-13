import { targetRulesFor } from "../../lib/subtitle/language/resolve";
import { mountSegmented } from "../../components/segmented";
import { mountChoiceCards, ChoiceCardsHandle } from "../../components/choiceCards";
import { t, TranslationKey } from "../../i18n";
import { AUTO_DETECT_CODE, defaultOutputMode } from "../../utils/languageProfiles";
import { OutputMode, BilingualStacking, CueLayout } from "../../lib/subtitle/types";
import { mountAssSizeFields } from "./assSizeFields";
import { mountCreditToggle } from "./creditToggle";
import type { WorkspaceContext } from "./context";

export interface OutputOptionsHandle {
  applyLanguageDefaults(languages: { sourceLang: string; targetLang: string }): void;
}

function segmentedChoices(entries: [string, TranslationKey, TranslationKey][]): { value: string; label: string; title: string }[] {
  return entries.map(([value, labelKey, tipKey]) => ({ value, label: t(labelKey), title: t(tipKey) }));
}

export function mountOutputOptions(ctx: WorkspaceContext): OutputOptionsHandle {
  const { state, signal } = ctx;
  const musicTopAlignToggle = ctx.query<HTMLInputElement>("#music-top-align-toggle");
  const assSizes = mountAssSizeFields(ctx);
  mountCreditToggle(ctx);

  function syncDependentFields(): void {
    const bilingual = state.outputMode === "bilingual";
    stacking.setDisabled(!bilingual);
    cueLayout.setDisabled(!bilingual);
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
