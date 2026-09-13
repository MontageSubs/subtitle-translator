import { AssFontPreset } from "../lib/subtitle/assTemplate";
import { OutputMode } from "../utils/types";

export interface AssOptionsPanelState {
  outputFormat: string;
  outputMode: OutputMode;
  assFontPreset: AssFontPreset;
  assEqualBilingualSize: boolean;
  assCustomPrimarySize: number;
  assCustomSecondarySize: number;
}

export interface AssOptionsPanelCallbacks {
  onVisibilityChange: () => void;
  onChange: () => void;
}

export interface AssOptionsPanelHandle {
  sync(): void;
}

export function mountAssOptionsPanel(
  container: HTMLElement,
  state: AssOptionsPanelState,
  callbacks: AssOptionsPanelCallbacks
): AssOptionsPanelHandle {
  const q = <T extends HTMLElement>(selector: string) => container.querySelector(selector) as T;
  const assOptionsRow = q<HTMLElement>("#ass-options-row");
  const assEqualSizeRow = q<HTMLElement>("#ass-equal-size-row");
  const assEqualSizeToggle = q<HTMLInputElement>("#ass-equal-size-toggle");
  const assPresetButtons = assOptionsRow.querySelectorAll<HTMLButtonElement>(".ass-preset-btn");
  const assCustomSizes = q<HTMLElement>("#ass-custom-sizes");
  const assSecondarySizeRow = q<HTMLElement>("#ass-secondary-size-row");
  const assPrimarySizeInput = q<HTMLInputElement>("#ass-primary-size");
  const assSecondarySizeInput = q<HTMLInputElement>("#ass-secondary-size");

  function sync(): void {
    const isAss = state.outputFormat === "ass";
    const bilingual = state.outputMode === "bilingual";
    assOptionsRow.hidden = !isAss;
    assEqualSizeRow.hidden = !(isAss && bilingual);
    assCustomSizes.hidden = state.assFontPreset !== "custom";
    assSecondarySizeRow.hidden = !bilingual || state.assEqualBilingualSize;
    assPresetButtons.forEach((btn) => btn.classList.toggle("ass-preset-btn--active", btn.dataset.preset === state.assFontPreset));
  }

  assEqualSizeToggle.addEventListener("change", () => {
    state.assEqualBilingualSize = assEqualSizeToggle.checked;
    sync();
    callbacks.onVisibilityChange();
    callbacks.onChange();
  });
  assPresetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.assFontPreset = btn.dataset.preset as AssFontPreset;
      sync();
      callbacks.onVisibilityChange();
      callbacks.onChange();
    });
  });
  assPrimarySizeInput.addEventListener("change", () => {
    state.assCustomPrimarySize = Number(assPrimarySizeInput.value) || state.assCustomPrimarySize;
    callbacks.onChange();
  });
  assSecondarySizeInput.addEventListener("change", () => {
    state.assCustomSecondarySize = Number(assSecondarySizeInput.value) || state.assCustomSecondarySize;
    callbacks.onChange();
  });

  return { sync };
}
