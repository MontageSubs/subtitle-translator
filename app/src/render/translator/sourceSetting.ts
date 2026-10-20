import { t } from "../../i18n";
import { SCENE_SECONDS_MIN, SCENE_SECONDS_MAX, SCENE_SLIDER_MIN, SCENE_SLIDER_MAX } from "../../components/sceneSplitField";
import { renderSetting } from "./setting";
import { renderToggleRow } from "./settingFields";

export interface SourceSettingInput {
  sdhEnabled: boolean;
  skipLyrics: boolean;
  sceneSeconds: number;
}

function renderSceneField(sceneSeconds: number): string {
  const sliderValue = Math.min(SCENE_SLIDER_MAX, Math.max(SCENE_SLIDER_MIN, sceneSeconds));
  return `
        <div class="field slider-field">
          <div class="slider-field__row">
            <label for="scene-seconds-number">${t("scene.label")}</label>
            <input type="number" id="scene-seconds-number" class="slider-field__number" min="${SCENE_SECONDS_MIN}" max="${SCENE_SECONDS_MAX}" value="${sceneSeconds}" aria-describedby="scene-hint" />
          </div>
          <input type="range" id="scene-seconds" aria-label="${t("scene.label")}" aria-describedby="scene-hint" min="${SCENE_SLIDER_MIN}" max="${SCENE_SLIDER_MAX}" step="1" value="${sliderValue}" />
          <p class="field__desc" id="scene-hint">${t("scene.hint")}</p>
          <p class="slider-field__hint" id="scene-preview-hint" aria-live="polite"></p>
          <button type="button" class="slider-field__toggle" id="scene-preview-toggle" aria-expanded="false" aria-controls="scene-preview-detail" hidden>${t("scene.previewDetails")}</button>
          <p class="slider-field__hint" id="scene-preview-detail" hidden></p>
        </div>`;
}

export function renderSourceSetting({ sdhEnabled, skipLyrics, sceneSeconds }: SourceSettingInput): string {
  return renderSetting({
    id: "source",
    title: t("setting.source.title"),
    primary: renderSceneField(sceneSeconds),
    more: `${renderToggleRow("sdh-toggle", "sdh.label", "sdh.desc", sdhEnabled)}${renderToggleRow("skip-lyrics-toggle", "lyrics.label", "lyrics.desc", skipLyrics)}`,
  });
}
