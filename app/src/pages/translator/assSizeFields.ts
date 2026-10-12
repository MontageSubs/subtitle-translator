import { mountSegmented } from "../../components/segmented";
import { t, TranslationKey } from "../../i18n";
import { AssFontPreset, defaultAssFontPlan } from "../../lib/subtitle/formats/ass/template";
import type { WorkspaceContext } from "./context";

const PRESETS: [AssFontPreset, TranslationKey, TranslationKey][] = [
  ["desktop", "ass.preset.desktop", "tip.sizeDesktop"],
  ["mobile", "ass.preset.mobile", "tip.sizeMobile"],
  ["custom", "ass.preset.custom", "tip.sizeCustom"],
];

export interface AssSizeFieldsHandle {
  sync(): void;
}

export function mountAssSizeFields(ctx: WorkspaceContext): AssSizeFieldsHandle {
  const { state, signal } = ctx;
  const primaryInput = ctx.query<HTMLInputElement>("#ass-primary-size");
  const secondaryInput = ctx.query<HTMLInputElement>("#ass-secondary-size");
  const equalSizeToggle = ctx.query<HTMLInputElement>("#ass-equal-size-toggle");
  let customEdited = false;

  function displayedSizes(): { primary: number; secondary: number } {
    const bilingual = state.outputMode === "bilingual";
    const originalFirst = bilingual && state.stackingOrder === "original_top";
    const sourceLang = state.files[0]?.jobResult?.resolved_source_lang || state.sourceLang;
    const plan = defaultAssFontPlan(
      originalFirst ? sourceLang : state.targetLang,
      originalFirst ? state.targetLang : sourceLang,
      bilingual,
      state.assEqualBilingualSize,
      { preset: state.assFontPreset, customPrimarySize: state.assCustomPrimarySize, customSecondarySize: state.assCustomSecondarySize }
    );
    return { primary: plan.primarySize, secondary: plan.secondarySize };
  }

  function showSize(input: HTMLInputElement, size: number): void {
    if (input.value !== String(size)) input.value = String(size);
  }

  function syncValues(edited?: HTMLInputElement): void {
    const { primary, secondary } = displayedSizes();
    if (edited !== primaryInput) showSize(primaryInput, primary);
    if (edited !== secondaryInput) showSize(secondaryInput, secondary);
  }

  function sync(): void {
    const bilingual = state.outputMode === "bilingual";
    const custom = state.assFontPreset === "custom";
    syncValues();
    equalSizeToggle.disabled = !bilingual || state.cueLayout !== "single";
    primaryInput.disabled = !custom;
    secondaryInput.disabled = !custom || !bilingual || state.assEqualBilingualSize;
    primaryInput.title = custom ? "" : t("tip.sizeLocked");
    secondaryInput.title = !custom ? t("tip.sizeLocked") : secondaryInput.disabled ? t("tip.secondaryLocked") : "";
  }

  function changed(): void {
    sync();
    ctx.flow.formattingChanged();
  }

  mountSegmented(
    ctx.query("#ass-size"),
    PRESETS.map(([value, labelKey, tipKey]) => ({ value, label: t(labelKey), title: t(tipKey) })),
    state.assFontPreset ?? "desktop",
    (value) => {
      if (value === "custom" && !customEdited) {
        const { primary, secondary } = displayedSizes();
        state.assCustomPrimarySize = primary;
        state.assCustomSecondarySize = secondary;
      }
      state.assFontPreset = value as AssFontPreset;
      changed();
    }
  );

  [primaryInput, secondaryInput].forEach((input) => {
    input.addEventListener("input", () => {
      customEdited = true;
      state.assCustomPrimarySize = Number(primaryInput.value) || state.assCustomPrimarySize;
      state.assCustomSecondarySize = Number(secondaryInput.value) || state.assCustomSecondarySize;
      syncValues(input);
      ctx.flow.formattingChanged();
    }, { signal });
  });

  equalSizeToggle.addEventListener("change", () => {
    state.assEqualBilingualSize = equalSizeToggle.checked;
    changed();
  }, { signal });

  sync();
  return { sync };
}
