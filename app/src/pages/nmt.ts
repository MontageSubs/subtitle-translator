import { DEFAULT_SCENE_CHANGE_SECONDS, previewChapterCount } from "../core/srtParse";
import { msToSrtTime } from "../core/srtRender";
import { detectFormat, parseSubtitle, renderSubtitle, withExtension, buildTranslatedFilename, ACCEPTED_EXTENSIONS } from "../core/subtitleFormat";
import { SOURCE_LANGUAGES, TARGET_LANGUAGES, AUTO_DETECT_CODE, defaultOutputMode, languageProfile } from "../core/languageProfiles";
import { Cue, OutputMode, BilingualStacking, SubtitleFormat } from "../core/types";
import { decodeSubtitleBytes, encodeSubtitleText, SourceFormat } from "../core/encoding";
import { completeTranslateJob, TranslateJobResponse } from "../core/workerClient";
import { applySdhStripping } from "../core/sdh";
import { detectSourceLanguage, isKnownSourceLanguage } from "../core/detect";
import { CONTEXT_MAX_CHARS, validateContext } from "../core/context";
import { loadBundledDictionary, entriesToGlossary, glossaryToEntries, DictionaryEntry } from "../core/dictionary";
import { mountGlossaryEditor } from "../components/glossaryEditor";
import { mountSegmented } from "../components/segmented";
import { openPreviewModal, PreviewCard, PreviewApplyResult } from "../components/previewModal";
import { openHistoryImportModal } from "../components/historyImportModal";
import { HistoryCue, HistorySubtitle, saveHistoryJob, updateHistoryJob, listLocalHistoryJobs } from "../core/history";
import { historyCuesToCues } from "../core/historyRender";
import { consumeHistoryRestore } from "../core/historyRestore";
import { getCachedDisplayStats, refreshDisplayStats, noteLocalTranslation } from "../core/remoteStats";
import { t, getLocale } from "../i18n";
import { buildPath } from "../router";
import { CLOSE_ICON, renderDirectionArrow } from "../render/icons";

const SCENE_SECONDS_MIN = 1;
const SCENE_SECONDS_MAX = 99999;
const SCENE_SLIDER_MIN = 5;
const SCENE_SLIDER_MAX = 120;

interface AppState {
  currentFilename: string;
  downloadFilename: string;
  currentHistoryId: string | null;
  sourceFormat: SourceFormat | null;
  lastCues: Cue[];
  lastJobResult: TranslateJobResponse | null;
  lastRenderMode: OutputMode;
  lastStacking: BilingualStacking;
  lastFormat: SubtitleFormat;
  sourceLang: string;
  targetLang: string;
  outputMode: OutputMode;
  stackingOrder: BilingualStacking;
  userPickedOutputMode: boolean;
  sdhEnabled: boolean;
  caseSensitiveTerms: boolean;
  sceneSeconds: number;
  contextText: string;
  glossaryEntries: DictionaryEntry[];
}

const state: AppState = {
  currentFilename: "",
  downloadFilename: "",
  currentHistoryId: null,
  sourceFormat: null,
  lastCues: [],
  lastJobResult: null,
  lastRenderMode: "monolingual",
  lastStacking: "translation_top",
  lastFormat: "srt",
  sourceLang: AUTO_DETECT_CODE,
  targetLang: "zh",
  outputMode: "monolingual",
  stackingOrder: "translation_top",
  userPickedOutputMode: false,
  sdhEnabled: true,
  caseSensitiveTerms: false,
  sceneSeconds: DEFAULT_SCENE_CHANGE_SECONDS,
  contextText: "",
  glossaryEntries: [],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hydrateFromHistory(): boolean {
  const job = consumeHistoryRestore("nmt");
  if (!job) return false;
  const sub = job.subtitles[0];
  state.currentFilename = sub?.filename || job.title || "original.srt";
  state.downloadFilename = "";
  state.currentHistoryId = null;
  state.sourceFormat = null;
  state.sourceLang = job.sourceLang;
  state.targetLang = job.targetLang;
  state.lastJobResult = null;
  if (sub) {
    state.outputMode = sub.outputMode;
    state.stackingOrder = sub.stacking;
    state.userPickedOutputMode = true;
    state.lastFormat = sub.format;
    state.lastRenderMode = sub.outputMode;
    state.lastStacking = sub.stacking;
    state.lastCues = historyCuesToCues(sub.cues);
  }
  state.glossaryEntries = job.glossary ? glossaryToEntries(job.glossary) : [];
  if (job.contextText !== undefined) state.contextText = job.contextText;
  if (job.caseSensitiveTerms !== undefined) state.caseSensitiveTerms = job.caseSensitiveTerms;
  if (job.stripSdh !== undefined) state.sdhEnabled = job.stripSdh;
  if (job.sceneSeconds !== undefined) state.sceneSeconds = job.sceneSeconds;
  return true;
}

export function mount(container: HTMLElement, _signal: AbortSignal): void {
  hydrateFromHistory();
  renderApp(container);
}

function renderApp(container: HTMLElement) {
  const locale = getLocale();
  const termsHref = buildPath(locale, "docs", ["terms"]);
  const privacyHref = buildPath(locale, "docs", ["privacy"]);
  const consentNote = t("start.consent", {
    terms: `<a href="${termsHref}" target="_blank" rel="noopener">${t("start.terms")}</a>`,
    privacy: `<a href="${privacyHref}" target="_blank" rel="noopener">${t("start.privacy")}</a>`,
  });

  container.innerHTML = `
    <header class="tool-header">
      <h1>${t("app.title")}</h1>
      <div class="stats-bar">
        <span id="stats-line"></span>
        <span id="local-stats-line"></span>
      </div>
    </header>

    <section class="step">
      <div class="step__head">
        <span class="step__num">1</span>
        <span class="step__title">${t("step.upload.title")}</span>
        <button type="button" id="cancel-upload" class="icon-btn" aria-label="${t("glossary.remove")}" ${state.currentFilename ? "" : "hidden"}>${CLOSE_ICON}</button>
      </div>
      <label class="dropzone" id="dropzone">
        <div class="dropzone__icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        </div>
        <div class="dropzone__title">${t("dropzone.title")}</div>
        <div class="dropzone__hint">${t("dropzone.hint")}</div>
        <div class="dropzone__file-queue" id="dropzone-file"></div>
        <input type="file" id="subtitle-file" accept="${ACCEPTED_EXTENSIONS.join(",")}" />
      </label>
    </section>

    <section class="step features-grid" id="intro-features" ${state.lastCues.length ? "hidden" : ""}>
      <div class="feature-item">
        <div class="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        </div>
        <h3>${t("app.feature.1.title")}</h3>
        <p>${t("app.feature.1.desc")}</p>
      </div>
      <div class="feature-item">
        <div class="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        </div>
        <h3>${t("app.feature.2.title")}</h3>
        <p>${t("app.feature.2.desc")}</p>
      </div>
      <div class="feature-item">
        <div class="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
        </div>
        <h3>${t("app.feature.3.title")}</h3>
        <p>${t("app.feature.3.desc")}</p>
      </div>
    </section>

    <section class="step" id="lang-step" ${state.lastCues.length ? "" : "hidden"}>
      <div class="step__head"><span class="step__num">2</span><span class="step__title">${t("step.lang.title")}</span><span class="engine-badge">${t("field.engine")}</span></div>
      <div class="field-row field-row--lang">
        <label class="field">
          <span>${t("field.sourceLang")}</span>
          <select id="source-lang"></select>
          <span class="detect-hint" id="detect-hint"></span>
        </label>
        <div class="lang-flow-arrow" aria-hidden="true">
          ${renderDirectionArrow(16)}
        </div>
        <label class="field">
          <span>${t("field.targetLang")}</span>
          <select id="target-lang"></select>
        </label>
      </div>
      <div class="field-row">
        <div class="field" id="output-mode-field" ${state.targetLang === "zh" ? "" : "hidden"}>
          <span>${t("field.outputMode")}</span>
          <div class="segmented" id="output-mode" role="group" aria-label="${t("field.outputMode")}"></div>
        </div>
        <div class="field" id="stacking-field" ${state.targetLang === "zh" && state.outputMode === "bilingual" ? "" : "hidden"}>
          <span>${t("field.stacking")}</span>
          <div class="segmented" id="stacking-order" role="group" aria-label="${t("field.stacking")}"></div>
        </div>
      </div>
      <div id="glossary-editor"></div>

      <div class="field-divider">${t("step.options.title")}</div>
      <div class="toggle-row">
        <div>
          <div class="toggle-row__label">${t("sdh.label")}</div>
          <div class="toggle-row__desc">${t("sdh.desc")}</div>
        </div>
        <label class="switch"><input type="checkbox" id="sdh-toggle" ${state.sdhEnabled ? "checked" : ""} /><span class="switch__track"></span></label>
      </div>
      <div class="toggle-row">
        <div>
          <div class="toggle-row__label">${t("caseSensitiveTerms.label")}</div>
          <div class="toggle-row__desc">${t("caseSensitiveTerms.desc")}</div>
        </div>
        <label class="switch"><input type="checkbox" id="case-sensitive-toggle" ${state.caseSensitiveTerms ? "checked" : ""} /><span class="switch__track"></span></label>
      </div>
      <div class="field slider-field">
        <div class="slider-field__row">
          <span>${t("scene.label")}</span>
          <input type="number" id="scene-seconds-number" class="slider-field__number" min="${SCENE_SECONDS_MIN}" max="${SCENE_SECONDS_MAX}" value="${state.sceneSeconds}" />
        </div>
        <input type="range" id="scene-seconds" min="${SCENE_SLIDER_MIN}" max="${SCENE_SLIDER_MAX}" step="1" value="${clamp(state.sceneSeconds, SCENE_SLIDER_MIN, SCENE_SLIDER_MAX)}" />
        <div class="slider-field__hint" id="scene-preview-hint">${t("scene.hint")}</div>
      </div>
      <div class="field field--context">
        <div class="field__header">
          <label for="context-input">${t("context.label")}</label>
          <button type="button" class="ghost-btn ghost-btn--mini" id="context-history-import">${t("history.import")}</button>
        </div>
        <div class="input-with-clear"><textarea id="context-input" rows="3" placeholder="${t("context.placeholder")}"></textarea><button type="button" class="input-clear-btn" id="context-clear" aria-label="${t("preview.clearSearch") || "Clear"}">${CLOSE_ICON}</button></div>
        <span class="field__counter" id="context-counter">${state.contextText.trim().length}/${CONTEXT_MAX_CHARS}</span>
        <div class="slider-field__hint" id="context-hint"></div>
      </div>
    </section>

    <section class="step" id="action-console" ${state.lastCues.length ? "" : "hidden"}>
      <div class="step__head"><span class="step__num">3</span><span class="step__title">${t("step.action.title")}</span></div>
      
      <div class="task-card" id="task-card">
        <div class="task-card__header">
          <div class="task-card__meta">
            <div class="task-card__file">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <span id="task-filename" class="task-card__filename">${state.currentFilename || ""}</span>
            </div>
            <div class="task-card__submeta">
              <span id="task-cue-count" class="task-card__badge"></span>
              <button type="button" class="task-card__config-pill" id="task-config-pill">
                <span id="task-direction" class="task-card__direction"></span>
                <span id="task-config-tags" class="task-card__tags"></span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="task-card__pill-icon"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
            </div>
          </div>
          <div class="task-card__status-badge task-card__status-badge--ready" id="task-status-badge">
            <span class="status-dot"></span>
            <span id="task-status-text">${t("task.status.ready")}</span>
          </div>
        </div>

        <div class="task-view task-view--ready" id="task-view-ready">
          <div class="task-ready-actions">
            <button type="button" id="start" class="primary task-start-btn">
              <span>${t("start.button")}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>
          </div>
          <p class="task-legal-note" id="task-legal-note">${consentNote}</p>
        </div>

        <div class="task-view task-view--processing" id="task-view-processing" hidden>
          <div class="task-processing-status">
            <div class="task-processing-label">
              <span class="task-spinner" aria-hidden="true"></span>
              <span id="progress-label">${t("progress.translating")}</span>
            </div>
            <span id="task-elapsed-timer" class="task-timer">0.0s</span>
          </div>
          <div class="task-progress-container">
            <div class="task-progress-fill task-progress-fill--indeterminate" id="task-progress-fill"></div>
          </div>
          <div class="task-processing-footer">
            <span id="progress-count" class="task-processing-detail"></span>
          </div>
        </div>

        <div class="task-view task-view--completed" id="task-view-completed" hidden>
          <div class="task-metrics-grid" id="task-metrics-grid">
            <div class="task-metric task-metric--status" id="metric-status-wrap">
              <span class="task-metric__value task-metric__value--status" id="metric-status">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>${t("task.status.done")}</span>
              </span>
              <span class="task-metric__label" id="metric-status-lbl">${t("field.status")}</span>
            </div>
            <div class="task-metric">
              <span class="task-metric__value" id="metric-cues">0</span>
              <span class="task-metric__label" id="metric-cues-lbl">${t("field.cues")}</span>
            </div>
            <div class="task-metric">
              <span class="task-metric__value" id="metric-elapsed">0.0s</span>
              <span class="task-metric__label">${t("task.metrics.elapsed")}</span>
            </div>
          </div>

          <div class="task-delivery-actions">
            <div class="task-download-group">
              <a id="download-link" class="primary primary--download" download>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span id="download-button-label">${t("download.button")}</span>
              </a>
              <details class="task-format-menu" id="task-format-menu">
                <summary class="task-format-trigger" title="${t("field.outputMode")}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </summary>
                <div class="task-format-popover">
                  <button type="button" class="task-format-option task-format-option--active" data-format="srt">
                    <span>SRT</span>
                    <span class="task-format-badge">.srt</span>
                  </button>
                  <button type="button" class="task-format-option" data-format="vtt">
                    <span>WebVTT</span>
                    <span class="task-format-badge">.vtt</span>
                  </button>
                </div>
              </details>
            </div>

            <button type="button" id="preview-button" class="secondary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              <span>${t("preview.button")}</span>
            </button>

            <button type="button" id="retranslate-button" class="ghost-btn ghost-btn--mini">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
              <span id="retranslate-label">${t("task.retranslate")}</span>
            </button>
          </div>
        </div>

        <div class="task-view task-view--failed" id="task-view-failed" hidden>
          <div class="task-metrics-grid">
            <div class="task-metric task-metric--failed">
              <span class="task-metric__value task-metric__value--failed">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                <span>${t("task.failed.title")}</span>
              </span>
              <span class="task-metric__label">${t("field.status")}</span>
            </div>
            <div class="task-metric">
              <span class="task-metric__value" id="task-failed-cues">0 / 0</span>
              <span class="task-metric__label">${t("field.completed")}</span>
            </div>
            <div class="task-metric">
              <span class="task-metric__value" id="task-failed-elapsed">0.0s</span>
              <span class="task-metric__label">${t("task.metrics.elapsed")}</span>
            </div>
          </div>

          <div class="task-failed-banner">
            <span class="task-failed-desc" id="task-error-text"></span>
          </div>

          <div class="task-failed-actions">
            <button type="button" id="task-retry-btn" class="primary task-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
              <span>${t("task.retry")}</span>
            </button>
            <button type="button" id="task-cancel-btn" class="secondary task-btn">
              <span>${t("task.cancel")}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="task-disclosures">
        <details class="task-disclosure" id="log-details" hidden>
          <summary class="task-disclosure__summary" id="log-summary">
            <span id="log-summary-text">${t("log.expand")}</span>
          </summary>
          <div class="task-disclosure__content">
            <pre class="log" id="log"></pre>
          </div>
        </details>
      </div>
    </section>

    

    <div class="captcha-backdrop" id="captcha-backdrop" hidden>
      <div class="captcha-backdrop__text">${t("captcha.text")}</div>
      <div class="captcha-backdrop__widget" id="captcha-widget"></div>
    </div>
  `;

  wireApp(container);
}

function fillSelect(select: HTMLSelectElement, langs: { code: string; label: string }[], selected: string, includeAuto = false) {
  const autoOption = includeAuto ? `<option value="${AUTO_DETECT_CODE}">${t("lang.autoDetect")}</option>` : "";
  select.innerHTML = autoOption + langs.map((l) => `<option value="${l.code}">${l.label} (${l.code})</option>`).join("");
  select.value = selected;
}

function wireApp(container: HTMLElement) {
  const q = <T extends HTMLElement>(selector: string) => container.querySelector(selector) as T;

  const dropzone = q<HTMLElement>("#dropzone");
  const dropzoneFile = q<HTMLElement>("#dropzone-file");
  const cancelUploadBtn = q<HTMLButtonElement>("#cancel-upload");
  const subtitleInput = q<HTMLInputElement>("#subtitle-file");
  const langStep = q<HTMLElement>("#lang-step");
  const introFeatures = q<HTMLElement>("#intro-features");
  const actionConsole = q<HTMLElement>("#action-console");

  const sourceSelect = q<HTMLSelectElement>("#source-lang");
  const targetSelect = q<HTMLSelectElement>("#target-lang");
  const detectHint = q<HTMLElement>("#detect-hint");
  const outputModeField = q<HTMLElement>("#output-mode-field");
  const outputModeContainer = q<HTMLElement>("#output-mode");
  const stackingField = q<HTMLElement>("#stacking-field");
  const stackingContainer = q<HTMLElement>("#stacking-order");
  const sdhToggle = q<HTMLInputElement>("#sdh-toggle");
  const caseSensitiveToggle = q<HTMLInputElement>("#case-sensitive-toggle");
  const sceneSecondsInput = q<HTMLInputElement>("#scene-seconds");
  const sceneSecondsNumber = q<HTMLInputElement>("#scene-seconds-number");
  const scenePreviewHint = q<HTMLElement>("#scene-preview-hint");
  const contextInput = q<HTMLTextAreaElement>("#context-input");
  const contextCounter = q<HTMLElement>("#context-counter");
  const contextHint = q<HTMLElement>("#context-hint");
  const contextClearBtn = q<HTMLButtonElement>("#context-clear");

  const taskFilename = q<HTMLElement>("#task-filename");
  const taskCueCount = q<HTMLElement>("#task-cue-count");
  const taskConfigPill = q<HTMLButtonElement>("#task-config-pill");
  const taskDirection = q<HTMLElement>("#task-direction");
  const taskConfigTags = q<HTMLElement>("#task-config-tags");
  const taskStatusBadge = q<HTMLElement>("#task-status-badge");
  const taskStatusText = q<HTMLElement>("#task-status-text");

  const taskViewReady = q<HTMLElement>("#task-view-ready");
  const taskViewProcessing = q<HTMLElement>("#task-view-processing");
  const taskViewCompleted = q<HTMLElement>("#task-view-completed");
  const taskViewFailed = q<HTMLElement>("#task-view-failed");

  const startButton = q<HTMLButtonElement>("#start");
  const progressLabel = q<HTMLElement>("#progress-label");
  const progressCount = q<HTMLElement>("#progress-count");
  const taskProgressFill = q<HTMLElement>("#task-progress-fill");
  const taskElapsedTimer = q<HTMLElement>("#task-elapsed-timer");

  const metricStatus = q<HTMLElement>("#metric-status");
  const metricStatusLbl = q<HTMLElement>("#metric-status-lbl");
  const metricCues = q<HTMLElement>("#metric-cues");
  const metricCuesLbl = q<HTMLElement>("#metric-cues-lbl");
  const metricElapsed = q<HTMLElement>("#metric-elapsed");

  const taskFailedCues = q<HTMLElement>("#task-failed-cues");
  const taskFailedElapsed = q<HTMLElement>("#task-failed-elapsed");
  const taskErrorText = q<HTMLElement>("#task-error-text");

  const downloadLink = q<HTMLAnchorElement>("#download-link");
  const downloadButtonLabel = q<HTMLElement>("#download-button-label");
  const taskFormatMenu = q<HTMLDetailsElement>("#task-format-menu");
  const taskFormatOptions = container.querySelectorAll<HTMLButtonElement>(".task-format-option");

  const previewButton = q<HTMLButtonElement>("#preview-button");
  const retranslateBtn = q<HTMLButtonElement>("#retranslate-button");

  const taskRetryBtn = q<HTMLButtonElement>("#task-retry-btn");
  const taskCancelBtn = q<HTMLButtonElement>("#task-cancel-btn");

  const logEl = q<HTMLElement>("#log");
  const logDetails = q<HTMLDetailsElement>("#log-details");
  const logSummary = q<HTMLElement>("#log-summary");
  const logSummaryText = q<HTMLElement>("#log-summary-text");

  const statsLine = q<HTMLElement>("#stats-line");
  const localStatsLine = q<HTMLElement>("#local-stats-line");
  const glossaryEditorContainer = q<HTMLElement>("#glossary-editor");

  fillSelect(sourceSelect, SOURCE_LANGUAGES, state.sourceLang, true);
  fillSelect(targetSelect, TARGET_LANGUAGES, state.targetLang);
  const outputModeSegmented = mountSegmented(
    outputModeContainer,
    [{ value: "bilingual", label: t("outputMode.bilingual") }, { value: "monolingual", label: t("outputMode.monolingual") }],
    state.outputMode,
    (value) => {
      state.userPickedOutputMode = true;
      state.outputMode = value as OutputMode;
      stackingField.hidden = targetSelect.value !== "zh" || state.outputMode !== "bilingual";
    }
  );
  const stackingSegmented = mountSegmented(
    stackingContainer,
    [{ value: "translation_top", label: t("stacking.translationTop") }, { value: "original_top", label: t("stacking.originalTop") }],
    state.stackingOrder,
    (value) => { state.stackingOrder = value as BilingualStacking; }
  );
  contextInput.value = state.contextText;
  if (state.currentFilename) dropzoneFile.textContent = t("dropzone.selected", { name: state.currentFilename });

  const glossaryHandle = mountGlossaryEditor(glossaryEditorContainer, state.glossaryEntries);

  async function loadDictionaryFor(languageCode: string) {
    if (languageCode === AUTO_DETECT_CODE) return;
    const entries = await loadBundledDictionary(languageCode);
    state.glossaryEntries = entries;
    glossaryHandle.setEntries(entries);
  }

  function updateOutputModeVisibility() {
    const isZhTarget = targetSelect.value === "zh";
    outputModeField.hidden = !isZhTarget;
    if (isZhTarget && !state.userPickedOutputMode) {
      state.outputMode = defaultOutputMode(sourceSelect.value === AUTO_DETECT_CODE ? "en" : sourceSelect.value, targetSelect.value);
      outputModeSegmented.setValue(state.outputMode);
    }
    stackingField.hidden = !isZhTarget || state.outputMode !== "bilingual";
  }

  function updateTaskHeader() {
    taskFilename.textContent = state.currentFilename || "";
    if (state.lastCues.length) {
      const scenes = previewChapterCount(state.lastCues, state.sceneSeconds * 1000);
      taskCueCount.textContent = t("task.cueAndScenes", { cues: state.lastCues.length, scenes });
    } else {
      taskCueCount.textContent = "";
    }
    const sourceLabel = sourceSelect.value === AUTO_DETECT_CODE
      ? t("lang.autoDetect")
      : (sourceSelect.options[sourceSelect.selectedIndex]?.text.split(" (")[0] || state.sourceLang);
    const targetLabel = targetSelect.options[targetSelect.selectedIndex]?.text.split(" (")[0] || state.targetLang;
    taskDirection.innerHTML = `<span>${sourceLabel}</span> ${renderDirectionArrow(12)} <strong>${targetLabel}</strong>`;

    const tags: string[] = [];
    const entries = glossaryHandle.getEntries();
    if (entries.length > 0) {
      tags.push(t("task.tag.glossaryCount", { count: entries.length }));
    }
    if (state.contextText.trim().length > 0) {
      tags.push(t("task.tag.context"));
    }
    taskConfigTags.innerHTML = tags.map((tg) => `<span class="task-card__tag">${tg}</span>`).join("");
  }

  taskConfigPill.addEventListener("click", () => {
    langStep.scrollIntoView({ behavior: "smooth", block: "start" });
    sourceSelect.focus();
  });

  targetSelect.addEventListener("change", () => {
    state.targetLang = targetSelect.value;
    updateOutputModeVisibility();
    updateTaskHeader();
  });

  sourceSelect.addEventListener("change", () => {
    state.sourceLang = sourceSelect.value;
    updateOutputModeVisibility();
    detectHint.textContent = sourceSelect.value === AUTO_DETECT_CODE && state.lastCues.length ? t("detect.auto") : "";
    detectHint.classList.remove("detect-hint--done");
    if (sourceSelect.value !== AUTO_DETECT_CODE) loadDictionaryFor(sourceSelect.value);
    updateTaskHeader();
  });

  function syncSceneSlider() {
    const effectiveMax = Math.max(SCENE_SLIDER_MAX, state.sceneSeconds);
    sceneSecondsInput.max = String(effectiveMax);
    sceneSecondsInput.value = String(state.sceneSeconds);
  }

  function updateScenePreview() {
    if (!state.lastCues.length) return;
    const count = previewChapterCount(state.lastCues, state.sceneSeconds * 1000);
    scenePreviewHint.textContent = t("scene.preview", { count });
  }

  sceneSecondsInput.addEventListener("input", () => {
    state.sceneSeconds = Number(sceneSecondsInput.value);
    sceneSecondsNumber.value = String(state.sceneSeconds);
    updateScenePreview();
    updateTaskHeader();
  });
  sceneSecondsNumber.addEventListener("input", () => {
    const parsed = Math.round(Number(sceneSecondsNumber.value));
    if (!Number.isFinite(parsed)) return;
    state.sceneSeconds = clamp(parsed, SCENE_SECONDS_MIN, SCENE_SECONDS_MAX);
    syncSceneSlider();
    updateScenePreview();
    updateTaskHeader();
  });
  sceneSecondsNumber.addEventListener("blur", () => { sceneSecondsNumber.value = String(state.sceneSeconds); });
  sdhToggle.addEventListener("change", () => {
    state.sdhEnabled = sdhToggle.checked;
    updateTaskHeader();
  });
  caseSensitiveToggle.addEventListener("change", () => { state.caseSensitiveTerms = caseSensitiveToggle.checked; });
  function updateContextCounter(): void {
    const length = state.contextText.trim().length;
    const overLimit = length > CONTEXT_MAX_CHARS;
    contextCounter.textContent = `${length}/${CONTEXT_MAX_CHARS}`;
    contextCounter.classList.toggle("field__counter--over", overLimit);
    contextHint.textContent = overLimit ? t("context.tooLong", { max: CONTEXT_MAX_CHARS }) : "";
  }
  contextClearBtn.addEventListener("click", () => {
    contextInput.value = "";
    state.contextText = "";
    updateContextCounter();
    updateTaskHeader();
    contextInput.focus();
  });
  contextInput.addEventListener("input", () => {
    state.contextText = contextInput.value;
    updateContextCounter();
    updateTaskHeader();
  });

  container.querySelector<HTMLButtonElement>("#context-history-import")?.addEventListener("click", () => {
    openHistoryImportModal("context", (res) => {
      if (res.contextText !== undefined) {
        state.contextText = res.contextText;
        contextInput.value = res.contextText;
        updateContextCounter();
        updateTaskHeader();
      }
    });
  });

  let logRecordsCount = 0;
  let logErrorsCount = 0;
  let timerInterval: number | null = null;
  let startTimestamp = 0;

  function setTaskState(mode: "ready" | "processing" | "completed" | "failed", extra?: { errorText?: string; elapsedMs?: number; completedCount?: number; totalCount?: number }) {
    taskStatusBadge.className = `task-card__status-badge task-card__status-badge--${mode === "processing" ? "translating" : mode}`;
    if (mode === "ready") {
      taskStatusText.textContent = t("task.status.ready");
      taskStatusBadge.hidden = false;
    } else if (mode === "processing") {
      taskStatusText.textContent = t("task.status.translating");
      taskStatusBadge.hidden = false;
    } else {
      taskStatusBadge.hidden = true;
    }

    taskViewReady.hidden = mode !== "ready";
    taskViewProcessing.hidden = mode !== "processing";
    taskViewCompleted.hidden = mode !== "completed";
    taskViewFailed.hidden = mode !== "failed";

    if (mode === "failed") {
      let userMsg = extra?.errorText || "";
      if (!userMsg || /fetch|network|failed to fetch/i.test(userMsg)) {
        userMsg = t("error.networkError");
      }
      taskErrorText.textContent = userMsg;

      const completed = extra?.completedCount ?? (state.lastJobResult ? state.lastJobResult.cues.filter((c) => !!c.translation).length : 0);
      const total = extra?.totalCount ?? (state.lastJobResult ? state.lastJobResult.cues.length : state.lastCues.length);
      taskFailedCues.textContent = `${completed.toLocaleString()} / ${total.toLocaleString()}`;

      if (extra?.elapsedMs) {
        taskFailedElapsed.textContent = `${(extra.elapsedMs / 1000).toFixed(1)}s`;
      } else if (startTimestamp > 0) {
        const elapsedSec = ((performance.now() - startTimestamp) / 1000).toFixed(1);
        taskFailedElapsed.textContent = `${elapsedSec}s`;
      } else {
        taskFailedElapsed.textContent = "0.0s";
      }

      logDetails.hidden = false;
      logDetails.open = true;
      logSummary.classList.add("task-disclosure__summary--error");
    } else {
      logSummary.classList.remove("task-disclosure__summary--error");
    }
  }

  function appendLog(message: string) {
    logRecordsCount++;
    if (/error|failed|fail/i.test(message)) {
      logErrorsCount++;
    }
    logDetails.hidden = false;
    logSummaryText.textContent = t("log.summary", { records: logRecordsCount, errors: logErrorsCount });
    logEl.textContent += `${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;

    const batchMatch = message.match(/batch\s+(\d+)\s*\/\s*(\d+)/i) || message.match(/批次\s*(\d+)\s*\/\s*(\d+)/);
    if (batchMatch) {
      const current = parseInt(batchMatch[1], 10);
      const total = parseInt(batchMatch[2], 10);
      if (total > 0) {
        const percent = Math.min(100, Math.round((current / total) * 100));
        progressCount.textContent = t("progress.batches", { completed: current, total });
        taskProgressFill.className = "task-progress-fill";
        taskProgressFill.style.width = `${percent}%`;
      }
    }
  }

  function clearLogs() {
    logRecordsCount = 0;
    logErrorsCount = 0;
    logEl.textContent = "";
    logDetails.hidden = true;
    logDetails.open = false;
    logSummaryText.textContent = t("log.expand");
  }

  async function handleFile(file: File) {
    state.currentFilename = file.name;
    state.downloadFilename = "";
    state.currentHistoryId = null;
    state.lastJobResult = null;
    clearLogs();
    const { text: content, format } = decodeSubtitleBytes(new Uint8Array(await file.arrayBuffer()));
    state.sourceFormat = format;
    state.lastFormat = detectFormat(file.name);
    cancelUploadBtn.hidden = false;
    dropzoneFile.textContent = t("dropzone.selected", { name: file.name });
    introFeatures.hidden = true;
    langStep.hidden = false;
    actionConsole.hidden = false;
    setTaskState("ready");

    state.lastCues = parseSubtitle(state.lastFormat, content);
    updateScenePreview();
    updateTaskHeader();

    if (sourceSelect.value === AUTO_DETECT_CODE) {
      const detected = await detectSourceLanguage(state.lastCues);
      if (detected && detected.reliable && isKnownSourceLanguage(detected.code)) {
        sourceSelect.value = detected.code;
        state.sourceLang = detected.code;
        loadDictionaryFor(detected.code);
        detectHint.textContent = t("detect.done", { label: languageProfile(detected.code).label, code: detected.code });
        detectHint.classList.add("detect-hint--done");
      } else {
        detectHint.textContent = t("detect.auto");
        detectHint.classList.remove("detect-hint--done");
      }
      updateOutputModeVisibility();
      updateTaskHeader();
    }
  }

  subtitleInput.addEventListener("change", () => { if (subtitleInput.files?.[0]) handleFile(subtitleInput.files[0]); });
  ["dragover", "dragenter"].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("dropzone--active"); }));
  ["dragleave", "drop"].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("dropzone--active"); }));
  dropzone.addEventListener("drop", (e) => {
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  cancelUploadBtn.addEventListener("click", () => {
    if (timerInterval) clearInterval(timerInterval);
    state.currentFilename = "";
    state.downloadFilename = "";
    state.currentHistoryId = null;
    state.lastJobResult = null;
    state.lastCues = [];
    subtitleInput.value = "";
    dropzoneFile.textContent = "";
    cancelUploadBtn.hidden = true;
    introFeatures.hidden = false;
    langStep.hidden = true;
    actionConsole.hidden = true;
    setTaskState("ready");
    clearLogs();
  });

  const cachedStats = getCachedDisplayStats();
  if (cachedStats) statsLine.textContent = t("stats.line", { ...cachedStats });
  refreshDisplayStats()
    .then((stats) => { if (stats) statsLine.textContent = t("stats.line", { ...stats }); })
    .catch(() => { if (!cachedStats) statsLine.textContent = ""; });
  listLocalHistoryJobs()
    .then((entries) => { localStatsLine.textContent = entries.length ? t("stats.local", { count: entries.length }) : ""; })
    .catch(() => {});

  function presentResult(job: TranslateJobResponse, elapsedMs?: number): string {
    const originalById = new Map(state.lastCues.map((c) => [c.id, c]));
    const rendered = renderSubtitle(state.lastFormat, job.cues, originalById, state.lastRenderMode, state.lastStacking);
    const outputFormat = state.sourceFormat ?? { encoding: "utf-8", bom: false, newline: "lf" as const };
    const blob = new Blob([encodeSubtitleText(rendered, outputFormat) as BlobPart], { type: "text/plain;charset=utf-8" });
    downloadLink.href = URL.createObjectURL(blob);
    state.downloadFilename = buildTranslatedFilename(
      state.currentFilename,
      state.lastFormat,
      job.resolved_source_lang || state.sourceLang,
      targetSelect.value,
      state.lastRenderMode,
      state.lastStacking
    );
    downloadLink.download = state.downloadFilename;
    downloadButtonLabel.textContent = `${t("download.button")} (${state.lastFormat.toUpperCase()})`;

    const isZh = getLocale().startsWith("zh");
    const missingCount = job.missing_cues.length;
    if (missingCount === 0) {
      metricStatus.className = "task-metric__value task-metric__value--status";
      metricStatus.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>${t("task.status.done")}</span>`;
    } else {
      metricStatus.className = "task-metric__value task-metric__value--warning";
      metricStatus.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span>${t("task.quality.missingCues", { count: missingCount.toLocaleString() })}</span>`;
    }
    if (metricStatusLbl) metricStatusLbl.textContent = t("field.status");

    metricCues.textContent = job.cues.length.toLocaleString();
    if (metricCuesLbl) metricCuesLbl.textContent = t("field.cues");

    const elapsedSec = ((elapsedMs ?? 1000) / 1000).toFixed(1);
    metricElapsed.textContent = `${elapsedSec}s`;

    taskFormatOptions.forEach((opt) => {
      const format = opt.getAttribute("data-format");
      opt.classList.toggle("task-format-option--active", format === state.lastFormat);
    });

    setTaskState("completed", { elapsedMs });
    return rendered;
  }

  taskFormatOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const fmt = option.getAttribute("data-format") as SubtitleFormat;
      if (!fmt || !state.lastJobResult) return;
      state.lastFormat = fmt;
      presentResult(state.lastJobResult);
      taskFormatMenu.open = false;
    });
  });

  const retranslateLabel = q<HTMLElement>("#retranslate-label");

  let retranslateConfirming = false;
  let retranslateTimer: number | null = null;

  function resetRetranslateBtn(): void {
    retranslateConfirming = false;
    if (retranslateTimer) {
      clearTimeout(retranslateTimer);
      retranslateTimer = null;
    }
    retranslateBtn.classList.remove("ghost-btn--confirm");
    if (retranslateLabel) retranslateLabel.textContent = t("task.retranslate");
  }

  retranslateBtn.addEventListener("click", () => {
    if (!retranslateConfirming) {
      retranslateConfirming = true;
      retranslateBtn.classList.add("ghost-btn--confirm");
      if (retranslateLabel) retranslateLabel.textContent = t("task.retranslateConfirm");
      retranslateTimer = window.setTimeout(() => {
        resetRetranslateBtn();
      }, 4000);
      return;
    }

    resetRetranslateBtn();
    setTaskState("ready");
  });

  taskRetryBtn.addEventListener("click", () => {
    startButton.click();
  });

  taskCancelBtn.addEventListener("click", () => {
    setTaskState("ready");
  });

  startButton.addEventListener("click", async () => {
    if (!state.lastCues.length) return;

    startButton.disabled = true;
    clearLogs();
    setTaskState("processing");
    progressLabel.textContent = t("progress.translating");
    progressCount.textContent = "";
    taskProgressFill.className = "task-progress-fill task-progress-fill--indeterminate";
    taskProgressFill.style.width = "";

    startTimestamp = performance.now();
    taskElapsedTimer.textContent = "0.0s";
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = window.setInterval(() => {
      const elapsed = ((performance.now() - startTimestamp) / 1000).toFixed(1);
      taskElapsedTimer.textContent = `${elapsed}s`;
    }, 100);

    try {
      const sourceLang = sourceSelect.value;
      const targetLang = targetSelect.value;
      const outputMode = state.outputMode;
      const sceneChangeSeconds = state.sceneSeconds;
      const stripSdhEnabled = sdhToggle.checked;

      state.glossaryEntries = glossaryHandle.getEntries() as DictionaryEntry[];
      const glossary = entriesToGlossary(state.glossaryEntries);

      const { cues: wireCues } = applySdhStripping(state.lastCues, sourceLang, stripSdhEnabled);

      let contextText: string | undefined;
      let contextNeedsTranslation = false;
      if (state.contextText.trim()) {
        const validation = await validateContext(state.contextText, sourceLang);
        contextText = validation.text || undefined;
        contextNeedsTranslation = validation.needsTranslation;
        contextHint.textContent = validation.needsTranslation
          ? t("context.willTranslate", { code: validation.detectedCode || "?" })
          : validation.truncated ? t("context.tooLong", { max: CONTEXT_MAX_CHARS }) : "";
      }

      const job = await completeTranslateJob(
        { cues: wireCues, glossary, source: sourceLang, target: targetLang, sceneChangeSeconds, caseSensitiveTerms: state.caseSensitiveTerms, contextText, contextNeedsTranslation },
        appendLog
      );
      if (!job.success) throw new Error(t("error.parseFailed"));
      noteLocalTranslation();

      if (timerInterval) clearInterval(timerInterval);
      const elapsedMs = Math.max(100, Math.round(performance.now() - startTimestamp));

      state.lastJobResult = job;
      state.lastRenderMode = outputMode;
      state.lastStacking = state.stackingOrder;
      state.lastFormat = detectFormat(state.currentFilename);

      if (sourceLang === AUTO_DETECT_CODE) {
        const known = SOURCE_LANGUAGES.some((l) => l.code === job.resolved_source_lang.split("-")[0]);
        detectHint.textContent = known
          ? t("detect.done", { label: languageProfile(job.resolved_source_lang).label, code: job.resolved_source_lang })
          : t("detect.unknown", { code: job.resolved_source_lang });
        detectHint.classList.add("detect-hint--done");
        updateTaskHeader();
      }

      progressLabel.textContent = t("progress.merging");
      presentResult(job, elapsedMs);

      const cueSettingsById = new Map(state.lastCues.map((c) => [c.id, c.cueSettings]));
      const historyCues: HistoryCue[] = job.cues.map((c) => ({
        id: c.id, start_ms: c.start_ms, end_ms: c.end_ms, sourceText: c.text, translatedText: c.translation ?? "", cueSettings: cueSettingsById.get(c.id),
      }));
      const sourceFilename = state.currentFilename || "subtitle.srt";
      const translatedFilename = state.downloadFilename;
      const sub: HistorySubtitle = {
        id: `${Date.now()}-sub-1`,
        sourceFilename,
        translatedFilename,
        filename: translatedFilename,
        format: state.lastFormat,
        outputMode: state.lastRenderMode,
        stacking: state.lastStacking,
        cues: historyCues,
      };
      saveHistoryJob({
        engine: "nmt",
        title: translatedFilename,
        sourceFilename,
        translatedFilename,
        sourceLang: job.resolved_source_lang,
        targetLang,
        subtitles: [sub],
        glossary: Object.keys(glossary).length ? glossary : undefined,
        contextText: state.contextText,
        caseSensitiveTerms: state.caseSensitiveTerms,
        stripSdh: state.sdhEnabled,
        sceneSeconds: sceneChangeSeconds,
      }).then((id) => {
        state.currentHistoryId = id;
        listLocalHistoryJobs().then((entries) => { localStatsLine.textContent = t("stats.local", { count: entries.length }); }).catch(() => {});
      }).catch(() => {});
    } catch (e) {
      if (timerInterval) clearInterval(timerInterval);
      const errMessage = e instanceof Error ? e.message : String(e);
      appendLog(t("error.prefix", { message: errMessage }));
      setTaskState("failed", { errorText: errMessage });
    } finally {
      startButton.disabled = false;
    }
  });

  function warningReasonOf(warning: TranslateJobResponse["quality_warnings"][number]): string {
    const reasons: string[] = [];
    if (warning.over_cps) reasons.push(t("preview.warning.overCps", { cps: warning.cps.toFixed(1) }));
    if (warning.over_length) reasons.push(t("preview.warning.overLength"));
    return reasons.join(" · ");
  }

  function applyPreviewEdits(edits: Map<number, string>, contextText?: string, glossaryEntries?: DictionaryEntry[]): PreviewApplyResult {
    if (!state.lastJobResult) return {};
    state.lastJobResult = {
      ...state.lastJobResult,
      cues: state.lastJobResult.cues.map((c) => (edits.has(c.id) ? { ...c, translation: edits.get(c.id)! } : c)),
    };
    if (contextText !== undefined) {
      state.contextText = contextText;
      contextInput.value = contextText;
      updateContextCounter();
    }
    if (glossaryEntries !== undefined) {
      state.glossaryEntries = glossaryEntries;
      glossaryHandle.setEntries(glossaryEntries);
    }
    const rawSrt = presentResult(state.lastJobResult);
    if (!state.currentHistoryId) return { rawSrt };
    const cueSettingsById = new Map(state.lastCues.map((c) => [c.id, c.cueSettings]));
    const historyCues: HistoryCue[] = state.lastJobResult.cues.map((c) => ({
      id: c.id, start_ms: c.start_ms, end_ms: c.end_ms, sourceText: c.text, translatedText: c.translation ?? "", cueSettings: cueSettingsById.get(c.id),
    }));
    const sourceFilename = state.currentFilename || "subtitle.srt";
    const translatedFilename = state.downloadFilename;
    const sub: HistorySubtitle = {
      id: `${state.currentHistoryId}-sub-1`,
      sourceFilename,
      translatedFilename,
      filename: translatedFilename,
      format: state.lastFormat,
      outputMode: state.lastRenderMode,
      stacking: state.lastStacking,
      cues: historyCues,
    };
    const partial: any = { subtitles: [sub], sourceFilename, translatedFilename };
    if (contextText !== undefined) partial.contextText = contextText;
    if (glossaryEntries !== undefined) partial.glossary = entriesToGlossary(glossaryEntries);
    updateHistoryJob(state.currentHistoryId, partial).catch(() => {});
    return { rawSrt };
  }

  previewButton.addEventListener("click", () => {
    if (!state.lastJobResult) return;
    const cards: PreviewCard[] = state.lastJobResult.cues.map((c) => ({
      id: c.id, start: msToSrtTime(c.start_ms), end: msToSrtTime(c.end_ms), source: c.text, target: c.translation || "",
      start_ms: c.start_ms, end_ms: c.end_ms, targetLang: targetSelect.value,
    }));
    const originalById = new Map(state.lastCues.map((c) => [c.id, c]));
    const sourceCues = state.lastJobResult.cues.map(c => ({ ...c, translation: null }));
    openPreviewModal(
      renderSubtitle(state.lastFormat, state.lastJobResult.cues, originalById, state.lastRenderMode, state.lastStacking),
      renderSubtitle(state.lastFormat, sourceCues, originalById, "monolingual", state.lastStacking),
      cards,
      { 
        onApply: applyPreviewEdits, 
        sceneSeconds: state.sceneSeconds,
        initialContext: state.contextText,
        initialGlossary: state.glossaryEntries,
        sourceFilename: state.currentFilename || "subtitle.srt",
        translatedFilename: state.downloadFilename,
      }
    );
  });

  document.addEventListener("click", (e) => {
    if (taskFormatMenu && taskFormatMenu.open && !taskFormatMenu.contains(e.target as Node)) {
      taskFormatMenu.open = false;
    }
  });

  if (state.lastJobResult) {
    presentResult(state.lastJobResult);
    updateTaskHeader();
  } else if (state.lastCues.length) {
    dropzoneFile.textContent = t("dropzone.selected", { name: state.currentFilename });
    cancelUploadBtn.hidden = false;
    introFeatures.hidden = true;
    langStep.hidden = false;
    actionConsole.hidden = false;
    updateOutputModeVisibility();
    updateTaskHeader();
    setTaskState("ready");
  }
}
