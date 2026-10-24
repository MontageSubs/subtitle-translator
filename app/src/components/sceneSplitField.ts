import { scopedQuery } from "../utils/dom";
import { t } from "../i18n";
import { countScenes } from "../lib/subtitle/common/sceneThreads";
import { escapeHtml } from "../utils/escapeHtml";
import { Cue } from "../lib/subtitle/types";

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

export interface SceneSample {
  name: string;
  cues: Cue[];
}

export interface SceneSplitFieldHandle {
  updatePreview(): void;
}

export function mountSceneSplitField(
  container: HTMLElement,
  state: SceneSplitFieldState,
  getSamples: () => SceneSample[],
  onChange: () => void
): SceneSplitFieldHandle {
  const q = scopedQuery(container);
  const sceneSecondsInput = q<HTMLInputElement>("#scene-seconds");
  const sceneSecondsNumber = q<HTMLInputElement>("#scene-seconds-number");
  const scenePreviewHint = q<HTMLElement>("#scene-preview-hint");
  const sceneDetailToggle = q<HTMLButtonElement>("#scene-preview-toggle");
  const sceneDetail = q<HTMLElement>("#scene-preview-detail");

  function showDetail(counts: { name: string; scenes: number }[]): void {
    const multiple = counts.length > 1;
    sceneDetailToggle.hidden = !multiple;
    sceneDetail.hidden = !multiple || sceneDetailToggle.getAttribute("aria-expanded") !== "true";
    sceneDetail.innerHTML = multiple
      ? counts.map(({ name, scenes }) => `<li class="slider-field__detail-item"><bdi class="slider-field__detail-name" title="${escapeHtml(name)}">${escapeHtml(name)}</bdi><span class="slider-field__detail-count">${t("scene.preview", { count: scenes })}</span></li>`).join("")
      : "";
  }

  function syncSlider(): void {
    const effectiveMax = Math.max(SCENE_SLIDER_MAX, state.sceneSeconds);
    sceneSecondsInput.max = String(effectiveMax);
    sceneSecondsInput.value = String(state.sceneSeconds);
  }

  function updatePreview(): void {
    const samples = getSamples().filter((sample) => sample.cues.length);
    if (!samples.length) return;
    const counts = samples.map((sample) => ({ name: sample.name, scenes: countScenes(sample.cues, state.sceneSeconds) }));
    const total = counts.reduce((sum, entry) => sum + entry.scenes, 0);
    if (counts.length === 1) {
      scenePreviewHint.textContent = t("scene.preview", { count: total });
    } else {
      scenePreviewHint.textContent = t("scene.previewMulti", { scenes: total, count: counts.length });
    }
    showDetail(counts);
  }

  sceneDetailToggle.addEventListener("click", () => {
    const expanded = sceneDetailToggle.getAttribute("aria-expanded") === "true";
    sceneDetailToggle.setAttribute("aria-expanded", String(!expanded));
    sceneDetail.hidden = expanded;
  });

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

  return { updatePreview };
}
