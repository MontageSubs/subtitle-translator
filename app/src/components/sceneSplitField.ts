import { t } from "../i18n";
import { previewChapterCount } from "../lib/subtitle/srtParse";
import { Cue } from "../utils/types";

export const SCENE_SECONDS_MIN = 1;
export const SCENE_SECONDS_MAX = 99999;
export const SCENE_SLIDER_MIN = 5;
export const SCENE_SLIDER_MAX = 120;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface SceneSplitFieldState {
  sceneSeconds: number;
}

export interface SceneSplitFieldHandle {
  updatePreview(): void;
  syncSlider(): void;
}

export function mountSceneSplitField(
  container: HTMLElement,
  state: SceneSplitFieldState,
  getSampleCues: () => Cue[] | undefined,
  onChange: () => void
): SceneSplitFieldHandle {
  const q = <T extends HTMLElement>(selector: string) => container.querySelector(selector) as T;
  const sceneSecondsInput = q<HTMLInputElement>("#scene-seconds");
  const sceneSecondsNumber = q<HTMLInputElement>("#scene-seconds-number");
  const scenePreviewHint = q<HTMLElement>("#scene-preview-hint");

  function syncSlider(): void {
    const effectiveMax = Math.max(SCENE_SLIDER_MAX, state.sceneSeconds);
    sceneSecondsInput.max = String(effectiveMax);
    sceneSecondsInput.value = String(state.sceneSeconds);
  }

  function updatePreview(): void {
    const sampleCues = getSampleCues();
    if (!sampleCues?.length) return;
    const count = previewChapterCount(sampleCues, state.sceneSeconds * 1000);
    scenePreviewHint.textContent = t("scene.preview", { count });
  }

  sceneSecondsInput.addEventListener("input", () => {
    state.sceneSeconds = Number(sceneSecondsInput.value);
    sceneSecondsNumber.value = String(state.sceneSeconds);
    updatePreview();
    onChange();
  });
  sceneSecondsNumber.addEventListener("input", () => {
    const parsed = Math.round(Number(sceneSecondsNumber.value));
    if (!Number.isFinite(parsed)) return;
    state.sceneSeconds = clamp(parsed, SCENE_SECONDS_MIN, SCENE_SECONDS_MAX);
    syncSlider();
    updatePreview();
    onChange();
  });
  sceneSecondsNumber.addEventListener("blur", () => {
    sceneSecondsNumber.value = String(state.sceneSeconds);
  });

  return { updatePreview, syncSlider };
}
