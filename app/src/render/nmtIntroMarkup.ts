import { TranslationKey } from "../i18n/dictionaries";
import { ACCEPTED_EXTENSIONS } from "../lib/subtitle/acceptedExtensions";
import { CLOSE_ICON } from "./icons";

export type Translator = (key: TranslationKey) => string;

const UPLOAD_ICON = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`;

const FEATURE_ICONS = [
  `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>`,
  `<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>`,
  `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>`,
];

export function renderNmtHeader(tr: Translator): string {
  return `
    <header class="tool-header">
      <h1>${tr("app.title")}</h1>
      <div class="stats-bar">
        <span id="stats-line"></span>
        <span id="local-stats-line"></span>
      </div>
    </header>`;
}

export function renderNmtUploadStep(tr: Translator, hasFiles: boolean): string {
  return `
    <section class="step" data-requires-js>
      <div class="step__head">
        <span class="step__num">1</span>
        <span class="step__title">${tr("step.upload.title")}</span>
        <button type="button" id="cancel-upload" class="icon-btn" aria-label="${tr("history.clearAll")}" ${hasFiles ? "" : "hidden"}>${CLOSE_ICON}</button>
      </div>
      <label class="dropzone" id="dropzone">
        <div class="dropzone__icon">${UPLOAD_ICON}</div>
        <div class="dropzone__title">${tr("dropzone.title")}</div>
        <div class="dropzone__hint">${tr("dropzone.hint")}</div>
        <div class="dropzone__file-queue" id="dropzone-file"></div>
        <input type="file" id="subtitle-file" accept="${ACCEPTED_EXTENSIONS.join(",")}" multiple />
      </label>
    </section>`;
}

export function renderNmtFeatures(tr: Translator, hidden: boolean): string {
  const items = FEATURE_ICONS.map((icon, index) => `
      <div class="feature-item">
        <div class="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg>
        </div>
        <h3>${tr(`app.feature.${index + 1}.title` as TranslationKey)}</h3>
        <p>${tr(`app.feature.${index + 1}.desc` as TranslationKey)}</p>
      </div>`).join("");
  return `
    <section class="step features-grid" id="intro-features" ${hidden ? "hidden" : ""}>${items}
    </section>`;
}
