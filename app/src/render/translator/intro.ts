import { tipAttr } from "../../utils/labelAttrs";
import { TranslationKey } from "../../i18n/dictionaries";
import { ACCEPTED_EXTENSIONS } from "../../lib/subtitle/formats/extensions";
import { CLOSE_ICON } from "../icons";

export type Translator = (key: TranslationKey) => string;

const UPLOAD_ICON = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`;

const FEATURE_ICONS = [
  `<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>`,
  `<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.4-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.4Z"></path><path d="m6.2 5.3 3.1 3.9"></path><path d="m12.4 3.4 3.1 4"></path><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path>`,
  `<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path><path d="M5 3v4"></path><path d="M19 17v4"></path><path d="M3 5h4"></path><path d="M17 19h4"></path>`,
];

export function renderTranslatorHeader(tr: Translator): string {
  return `
    <header class="tool-header">
      <h1>${tr("app.title")}</h1>
      <div class="stats-bar">
        <span id="stats-line"></span>
        <span id="local-stats-line"></span>
      </div>
    </header>`;
}

export function renderTranslatorUploadStep(tr: Translator, hasFiles: boolean): string {
  return `
    <section class="step" data-requires-js>
      <div class="step__head">
        <span class="step__num">1</span>
        <h2 class="step__title">${tr("step.upload.title")}</h2>
        <button type="button" id="cancel-upload" class="icon-btn icon-btn--confirmable" ${tipAttr(tr("upload.clear"))}${hasFiles ? "" : " disabled"}>${CLOSE_ICON}<span class="icon-btn__label" id="cancel-upload-label">${tr("upload.clear")}</span></button>
      </div>
      <div class="dropzone" id="dropzone">
        <label class="dropzone__prompt" for="subtitle-file">
          <span class="dropzone__icon">${UPLOAD_ICON}</span>
          <span class="dropzone__title" id="dropzone-title"><span class="input-pointer">${tr("dropzone.title")}</span><span class="input-touch">${tr("dropzone.titleTouch")}</span></span>
          <span class="dropzone__hint" id="dropzone-hint"><span class="input-pointer">${tr("dropzone.hint")}</span><span class="input-touch">${tr("dropzone.hintTouch")}</span></span>
        </label>
        <div class="dropzone__file-queue" id="dropzone-file"></div>
        <input type="file" id="subtitle-file" aria-labelledby="dropzone-title" aria-describedby="dropzone-hint" accept="${ACCEPTED_EXTENSIONS.join(",")}" multiple />
      </div>
    </section>`;
}

export function renderTranslatorFeatures(tr: Translator, hidden: boolean): string {
  const items = FEATURE_ICONS.map((icon, index) => `
      <div class="feature-item">
        <div class="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
        </div>
        <h2>${tr(`app.feature.${index + 1}.title` as TranslationKey)}</h2>
        <p>${tr(`app.feature.${index + 1}.desc` as TranslationKey)}</p>
      </div>`).join("");
  return `
    <section class="step features-grid" data-intro${hidden ? " hidden" : ""}>${items}
    </section>`;
}
