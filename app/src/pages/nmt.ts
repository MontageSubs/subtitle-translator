import { DEFAULT_SCENE_CHANGE_SECONDS, previewChapterCount } from '../lib/subtitle/srtParse';
import { msToSrtTime } from '../lib/subtitle/srtRender';
import { detectFormat, parseSubtitle, renderSubtitle, buildTranslatedFilename, ACCEPTED_EXTENSIONS, isValidSubtitleContent } from '../lib/subtitle/subtitleFormat';
import { SOURCE_LANGUAGES, TARGET_LANGUAGES, AUTO_DETECT_CODE, defaultOutputMode, languageProfile } from '../utils/languageProfiles';
import { Cue, OutputMode, BilingualStacking, SubtitleFormat } from '../utils/types';
import { decodeSubtitleBytes, encodeSubtitleText, SourceFormat } from '../utils/encoding';
import { completeTranslateJob, TranslateJobResponse, updateCaptchaScrollLock, formatWorkerError } from '../api/workerClient';
import { applySdhStripping } from '../lib/subtitle/sdh';
import { detectSourceLanguage, isKnownSourceLanguage } from '../utils/detect';
import { CONTEXT_MAX_CHARS, validateContext } from '../utils/context';
import { loadBundledDictionary, entriesToGlossary, glossaryToEntries, DictionaryEntry } from '../utils/dictionary';
import { mountGlossaryEditor } from "../components/glossaryEditor";
import { mountSegmented } from "../components/segmented";
import { openPreviewModal, PreviewCard, PreviewApplyResult } from "../components/previewModal";
import { openHistoryImportModal } from "../components/historyImportModal";
import { HistorySubtitle, saveHistoryJob, updateHistoryJob, listLocalHistoryJobs } from '../lib/history/history';
import { historyCuesToCues, buildHistoryCues } from '../lib/history/historyRender';
import { consumeHistoryRestore } from '../lib/history/historyRestore';
import { getCachedDisplayStats, refreshDisplayStats, noteLocalTranslation } from '../api/remoteStats';
import { buildOutputZip, collectSourcesFromFiles, collectSourcesFromDataTransfer, withDirectoryOf, CollectResult } from '../lib/subtitle/archive';
import { escapeHtml } from '../utils/escapeHtml';
import { formatFrontendLog } from '../utils/logger';
import { t, getLocale } from "../i18n";
import { buildPath } from '../router/router';
import { CLOSE_ICON, DOWNLOAD_ICON, EYE_ICON, renderDirectionArrow } from "../render/icons";
import { setTranslationCompletedNotDownloaded, setContextOrGlossaryEdited } from '../lib/unsavedChanges';

const SCENE_SECONDS_MIN = 1;
const SCENE_SECONDS_MAX = 99999;
const SCENE_SLIDER_MIN = 5;
const SCENE_SLIDER_MAX = 120;

interface SubtitleFile {
  id: string;
  filename: string;
  relativePath: string;
  sourceFormat: SourceFormat | null;
  originFormat: SubtitleFormat;
  cues: Cue[];
  jobResult: TranslateJobResponse | null;
  renderMode: OutputMode;
  stacking: BilingualStacking;
  downloadFilename: string;
  parseError: boolean;
  parseErrorReason?: "invalidFormat" | "noCues" | null;
}

interface AppState {
  files: SubtitleFile[];
  rejectedArchives: string[];
  outputFormat: SubtitleFormat;
  currentHistoryId: string | null;
  provider: string;
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
  files: [],
  rejectedArchives: [],
  outputFormat: "srt",
  currentHistoryId: null,
  provider: localStorage.getItem("subtitle-translator:provider") || "google-nmt-pa",
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

function generateFileId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function effectiveFormat(file: SubtitleFile): SubtitleFormat {
  return file.originFormat === "ass" ? "ass" : state.outputFormat;
}

function fileCountLabel(count: number): string {
  return t("task.fileCount", { count });
}

function taskHeaderLabel(files: SubtitleFile[]): string {
  return files.length === 1 ? files[0].filename : fileCountLabel(files.length);
}

function hydrateFromHistory(): boolean {
  const job = consumeHistoryRestore("nmt");
  if (!job) return false;

  state.files = job.subtitles.map((sub) => ({
    id: sub.id || generateFileId(),
    filename: sub.filename || sub.sourceFilename || job.title || "original.srt",
    relativePath: sub.relativePath || sub.sourceFilename || sub.filename || "original.srt",
    sourceFormat: sub.sourceFormat || null,
    originFormat: sub.format,
    cues: historyCuesToCues(sub.cues),
    jobResult: null,
    renderMode: sub.outputMode,
    stacking: sub.stacking,
    downloadFilename: "",
    parseError: false,
  }));
  state.outputFormat = state.files.find((f) => f.originFormat !== "ass")?.originFormat || "srt";
  state.currentHistoryId = null;
  state.sourceLang = job.sourceLang;
  state.targetLang = job.targetLang;
  if (state.files.length) {
    state.outputMode = state.files[0].renderMode;
    state.stackingOrder = state.files[0].stacking;
    state.userPickedOutputMode = true;
  }
  state.glossaryEntries = job.glossary ? glossaryToEntries(job.glossary) : [];
  if (job.contextText !== undefined) state.contextText = job.contextText;
  if (job.caseSensitiveTerms !== undefined) state.caseSensitiveTerms = job.caseSensitiveTerms;
  if (job.stripSdh !== undefined) state.sdhEnabled = job.stripSdh;
  if (job.sceneSeconds !== undefined) state.sceneSeconds = job.sceneSeconds;
  return true;
}

const DRAFT_STORAGE_KEY = "subtitle_translator_draft_v1";

function saveDraftState(): void {
  try {
    const data = {
      files: state.files.map((f) => ({
        id: f.id,
        filename: f.filename,
        relativePath: f.relativePath,
        sourceFormat: f.sourceFormat,
        originFormat: f.originFormat,
        cues: f.cues,
        renderMode: f.renderMode,
        stacking: f.stacking,
        downloadFilename: f.downloadFilename,
        parseError: f.parseError,
      })),
      outputFormat: state.outputFormat,
      provider: state.provider,
      sourceLang: state.sourceLang,
      targetLang: state.targetLang,
      outputMode: state.outputMode,
      stackingOrder: state.stackingOrder,
      userPickedOutputMode: state.userPickedOutputMode,
      sdhEnabled: state.sdhEnabled,
      caseSensitiveTerms: state.caseSensitiveTerms,
      sceneSeconds: state.sceneSeconds,
      contextText: state.contextText,
      glossaryEntries: state.glossaryEntries,
    };
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
  } catch {
  }
}

function clearDraftState(): void {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
  }
}

function loadDraftState(): boolean {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const hasFiles = Array.isArray(data.files) && data.files.length > 0;
    const hasContext = typeof data.contextText === "string" && data.contextText.trim().length > 0;
    const hasGlossary = Array.isArray(data.glossaryEntries) && data.glossaryEntries.length > 0;
    if (!data || (!hasFiles && !hasContext && !hasGlossary)) return false;

    if (hasFiles) {
      state.files = data.files.map((f: any) => ({
        ...f,
        jobResult: null,
      }));
    } else {
      state.files = [];
    }
    if (data.outputFormat) state.outputFormat = data.outputFormat;
    if (data.provider) state.provider = data.provider;
    if (data.sourceLang) state.sourceLang = data.sourceLang;
    if (data.targetLang) state.targetLang = data.targetLang;
    if (data.outputMode) state.outputMode = data.outputMode;
    if (data.stackingOrder) state.stackingOrder = data.stackingOrder;
    if (typeof data.userPickedOutputMode === "boolean") state.userPickedOutputMode = data.userPickedOutputMode;
    if (typeof data.sdhEnabled === "boolean") state.sdhEnabled = data.sdhEnabled;
    if (typeof data.caseSensitiveTerms === "boolean") state.caseSensitiveTerms = data.caseSensitiveTerms;
    if (typeof data.sceneSeconds === "number") state.sceneSeconds = data.sceneSeconds;
    if (typeof data.contextText === "string") state.contextText = data.contextText;
    if (Array.isArray(data.glossaryEntries)) state.glossaryEntries = data.glossaryEntries;
    return true;
  } catch {
    return false;
  }
}

function syncUnsavedChangesState(): void {
  const hasContextOrGlossary = state.contextText.trim().length > 0 || state.glossaryEntries.length > 0;
  setContextOrGlossaryEdited(hasContextOrGlossary);
}

export function mount(container: HTMLElement, _signal: AbortSignal): void {
  if (!hydrateFromHistory()) {
    loadDraftState();
  }
  syncUnsavedChangesState();
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

  let workspaceWrapper = container.querySelector("#nmt-workspace") as HTMLElement | null;
  if (!workspaceWrapper) {
    workspaceWrapper = document.createElement("div");
    workspaceWrapper.id = "nmt-workspace";
    container.appendChild(workspaceWrapper);
  }

  workspaceWrapper.innerHTML = `
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
        <button type="button" id="cancel-upload" class="icon-btn" aria-label="${t("history.clearAll")}" ${state.files.length ? "" : "hidden"}>${CLOSE_ICON}</button>
      </div>
      <label class="dropzone" id="dropzone">
        <div class="dropzone__icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        </div>
        <div class="dropzone__title">${t("dropzone.title")}</div>
        <div class="dropzone__hint">${t("dropzone.hint")}</div>
        <div class="dropzone__file-queue" id="dropzone-file"></div>
        <input type="file" id="subtitle-file" accept="${ACCEPTED_EXTENSIONS.join(",")}" multiple />
      </label>
    </section>

    <section class="step features-grid" id="intro-features" ${state.files.length ? "hidden" : ""}>
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

    <section class="step" id="lang-step" ${state.files.length ? "" : "hidden"}>
      <div class="step__head">
        <span class="step__num">2</span>
        <span class="step__title">${t("step.lang.title")}</span>
        <div class="provider-switcher">
          <span style="font-size: 0.85rem; color: var(--muted); margin-right: 8px;">${t("field.engine")}:</span>
          <select id="provider-select" class="provider-select">
            <option value="google-nmt-pa">Google NMT</option>
            <option value="microsoft-nmt-edge">Microsoft NMT</option>
          </select>
        </div>
      </div>
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

    <section class="step" id="action-console" ${state.files.length ? "" : "hidden"}>
      <div class="step__head"><span class="step__num">3</span><span class="step__title">${t("step.action.title")}</span></div>
      
      <div class="task-card" id="task-card">
        <div class="task-card__header">
          <div class="task-card__meta">
            <div class="task-card__file">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <span id="task-filename" class="task-card__filename">${taskHeaderLabel(state.files)}</span>
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
            <button type="button" id="task-stop-btn" class="ghost-btn ghost-btn--mini">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
              <span id="task-stop-label">${t("task.stop")}</span>
            </button>
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

          <div class="task-file-list" id="task-file-list" hidden></div>

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
                  <button type="button" class="task-format-option" data-format="srt">
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
              ${EYE_ICON}
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
  `;

  wireApp(container);
  updateCaptchaScrollLock();
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

  const providerSelect = q<HTMLSelectElement>("#provider-select");
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
  const taskFileList = q<HTMLElement>("#task-file-list");

  const previewButton = q<HTMLButtonElement>("#preview-button");
  const retranslateBtn = q<HTMLButtonElement>("#retranslate-button");

  const taskRetryBtn = q<HTMLButtonElement>("#task-retry-btn");
  const taskCancelBtn = q<HTMLButtonElement>("#task-cancel-btn");
  const taskStopBtn = q<HTMLButtonElement>("#task-stop-btn");

  const logEl = q<HTMLElement>("#log");
  const logDetails = q<HTMLDetailsElement>("#log-details");
  const logSummary = q<HTMLElement>("#log-summary");
  const logSummaryText = q<HTMLElement>("#log-summary-text");

  const statsLine = q<HTMLElement>("#stats-line");
  const localStatsLine = q<HTMLElement>("#local-stats-line");
  const glossaryEditorContainer = q<HTMLElement>("#glossary-editor");

  fillSelect(sourceSelect, SOURCE_LANGUAGES, state.sourceLang, true);
  fillSelect(targetSelect, TARGET_LANGUAGES, state.targetLang);
  providerSelect.value = state.provider;

  providerSelect.addEventListener("change", () => {
    state.provider = providerSelect.value;
    localStorage.setItem("subtitle-translator:provider", state.provider);
  });
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

  const glossaryHandle = mountGlossaryEditor(glossaryEditorContainer, state.glossaryEntries, () => {
    state.glossaryEntries = glossaryHandle ? glossaryHandle.getEntries() : state.glossaryEntries;
    saveDraftState();
    syncUnsavedChangesState();
    updateTaskHeader();
  });

  async function loadDictionaryFor(languageCode: string) {
    if (languageCode === AUTO_DETECT_CODE) return;
    const entries = await loadBundledDictionary(languageCode);
    state.glossaryEntries = entries;
    glossaryHandle.setEntries(entries);
    saveDraftState();
    syncUnsavedChangesState();
    updateTaskHeader();
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
    taskFilename.textContent = taskHeaderLabel(state.files);
    taskCueCount.textContent = state.files.length ? fileCountLabel(state.files.length) : "";
    const sourceLabel = sourceSelect.value === AUTO_DETECT_CODE
      ? t("lang.autoDetect")
      : (sourceSelect.options[sourceSelect.selectedIndex]?.text.split(" (")[0] || state.sourceLang);
    const targetLabel = targetSelect.options[targetSelect.selectedIndex]?.text.split(" (")[0] || state.targetLang;
    taskDirection.innerHTML = `<span>${sourceLabel}</span> ${renderDirectionArrow(12)} <strong>${targetLabel}</strong>`;

    const tags: string[] = [];
    const entries = glossaryHandle ? glossaryHandle.getEntries() : state.glossaryEntries;
    if (entries.length > 0) {
      tags.push(t("task.tag.glossaryCount", { count: entries.length }));
    }
    if (state.contextText.trim().length > 0) {
      tags.push(t("task.tag.context"));
    }
    taskConfigTags.innerHTML = tags.map((tg) => `<span class="task-card__tag">${tg}</span>`).join("");

    const validCuesCount = state.files.reduce((sum, f) => sum + (f.parseError ? 0 : f.cues.length), 0);
    const hasParseErrors = state.files.some((f) => f.parseError) || state.rejectedArchives.length > 0;
    startButton.disabled = validCuesCount === 0 || hasParseErrors;

    saveDraftState();
    syncUnsavedChangesState();
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
    detectHint.textContent = sourceSelect.value === AUTO_DETECT_CODE && state.files.length ? t("detect.auto") : "";
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
    const sampleCues = state.files[0]?.cues;
    if (!sampleCues?.length) return;
    const count = previewChapterCount(sampleCues, state.sceneSeconds * 1000);
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
  let currentFileIndex = 0;
  let totalFilesInRun = 0;
  let lastDownloadUrl: string | null = null;

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

      const completed = extra?.completedCount ?? state.files.filter((f) => f.jobResult).length;
      const total = extra?.totalCount ?? state.files.length;
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

  function updateFileProgress(fileTranslated?: number, fileTotal?: number) {
    const multi = totalFilesInRun > 1;
    const fileLabel = multi ? t("progress.fileOf", { current: currentFileIndex + 1, total: totalFilesInRun }) : "";
    if (fileTotal) {
      const fileFraction = totalFilesInRun ? currentFileIndex / totalFilesInRun : 0;
      const cueFraction = (fileTranslated || 0) / fileTotal / (totalFilesInRun || 1);
      const percent = Math.min(100, Math.round((fileFraction + cueFraction) * 100));
      taskProgressFill.className = "task-progress-fill";
      taskProgressFill.style.width = `${percent}%`;
      const cueLabel = `${fileTranslated} / ${fileTotal} ${t("progress.cueUnit")}`;
      progressCount.textContent = fileLabel ? `${fileLabel} · ${cueLabel}` : cueLabel;
    } else {
      progressCount.textContent = fileLabel;
    }
  }

  function appendLog(message: string) {
    const formatted = formatFrontendLog(message);
    if (!formatted) return;
    const currentLogs = logEl.textContent ? logEl.textContent.trim().split("\n") : [];
    if (currentLogs.length > 0 && currentLogs[currentLogs.length - 1] === formatted) {
      return;
    }
    logRecordsCount++;
    if (/\[ERROR\]|\[WARN\]/i.test(formatted)) {
      logErrorsCount++;
    }
    logDetails.hidden = false;
    logSummaryText.textContent = t("log.summary", { records: logRecordsCount, errors: logErrorsCount });
    logEl.textContent += `${formatted}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clearLogs() {
    logRecordsCount = 0;
    logErrorsCount = 0;
    logEl.textContent = "";
    logDetails.hidden = true;
    logDetails.open = false;
    logSummaryText.textContent = t("log.expand");
  }

  function renderFileQueue() {
    const errorMessages: string[] = [];

    const fileChips = state.files.map((f) => {
      let titleMsg = f.relativePath;
      if (f.parseError) {
        if (f.parseErrorReason === "invalidFormat") {
          titleMsg = t("error.invalidSubtitleFormat", { name: f.filename });
        } else if (f.parseErrorReason === "noCues") {
          titleMsg = t("error.noDialogueLines", { name: f.filename });
        } else {
          titleMsg = t("error.unreadableFile", { name: f.filename });
        }
        errorMessages.push(titleMsg);
      }
      return `
        <span class="file-chip ${f.parseError ? "file-chip--error" : ""}" title="${escapeHtml(titleMsg)}">
          <span class="file-chip__name">${escapeHtml(f.relativePath)}</span>
          <button type="button" class="file-chip__remove" data-remove-file="${f.id}" aria-label="${t("glossary.remove")}">${CLOSE_ICON}</button>
        </span>
      `;
    }).join("");

    const archiveChips = state.rejectedArchives.map((name, index) => {
      const msg = t("error.unsupportedArchive", { name });
      errorMessages.push(msg);
      return `
        <span class="file-chip file-chip--error" title="${escapeHtml(msg)}">
          <span class="file-chip__name">${escapeHtml(name)}</span>
          <button type="button" class="file-chip__remove" data-remove-archive="${index}" aria-label="${t("glossary.remove")}">${CLOSE_ICON}</button>
        </span>
      `;
    }).join("");

    let errorBannerHtml = "";
    if (errorMessages.length > 0) {
      errorBannerHtml = `
        <div class="file-queue-error-banner" role="alert" style="margin-top: 10px; width: 100%; padding: 10px 14px; background: color-mix(in srgb, var(--danger, #e53935) 12%, transparent); border: 1px solid color-mix(in srgb, var(--danger, #e53935) 30%, transparent); border-radius: 8px; color: var(--danger, #e53935); font-size: 0.85rem; line-height: 1.4;">
          ${errorMessages.map((m) => `<div>⚠️ ${escapeHtml(m)}</div>`).join("")}
        </div>
      `;
    }

    dropzoneFile.innerHTML = fileChips + archiveChips + errorBannerHtml;

    dropzoneFile.querySelectorAll<HTMLButtonElement>("[data-remove-file]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeFile(btn.dataset.removeFile!);
      });
    });
    dropzoneFile.querySelectorAll<HTMLButtonElement>("[data-remove-archive]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.rejectedArchives.splice(Number(btn.dataset.removeArchive), 1);
        if (!state.files.length && !state.rejectedArchives.length) {
          resetAll();
          return;
        }
        renderFileQueue();
        updateTaskHeader();
      });
    });
  }

  function resetAll() {
    if (timerInterval) clearInterval(timerInterval);
    state.files = [];
    state.rejectedArchives = [];
    state.currentHistoryId = null;
    state.contextText = "";
    state.glossaryEntries = [];
    clearDraftState();
    setTranslationCompletedNotDownloaded(false);
    setContextOrGlossaryEdited(false);
    contextInput.value = "";
    if (glossaryHandle) glossaryHandle.setEntries([]);
    updateContextCounter();
    subtitleInput.value = "";
    renderFileQueue();
    cancelUploadBtn.hidden = true;
    introFeatures.hidden = false;
    langStep.hidden = true;
    actionConsole.hidden = true;
    setTaskState("ready");
    clearLogs();
  }

  function removeFile(id: string) {
    state.files = state.files.filter((f) => f.id !== id);
    if (!state.files.length && !state.rejectedArchives.length) {
      resetAll();
      return;
    }
    renderFileQueue();
    updateScenePreview();
    updateTaskHeader();
  }

  async function ingestSources(result: CollectResult) {
    if (!result.sources.length && !result.rejectedArchives.length) return;
    const wasEmpty = state.files.length === 0;
    clearLogs();
    state.currentHistoryId = null;

    for (const source of result.sources) {
      const { text: content, format: sourceFormat } = decodeSubtitleBytes(source.bytes);
      const originFormat = detectFormat(source.name);
      const isValid = isValidSubtitleContent(content, originFormat);
      const cues = isValid ? parseSubtitle(originFormat, content) : [];

      let parseErrorReason: "invalidFormat" | "noCues" | null = null;
      if (!isValid) {
        parseErrorReason = "invalidFormat";
      } else if (cues.length === 0) {
        parseErrorReason = "noCues";
      }

      state.files.push({
        id: generateFileId(),
        filename: source.name,
        relativePath: source.relativePath,
        sourceFormat,
        originFormat,
        cues,
        jobResult: null,
        renderMode: state.outputMode,
        stacking: state.stackingOrder,
        downloadFilename: "",
        parseError: parseErrorReason !== null,
        parseErrorReason,
      });
    }
    state.rejectedArchives.push(...result.rejectedArchives);

    if (wasEmpty && state.files.length) {
      state.outputFormat = state.files.find((f) => f.originFormat !== "ass")?.originFormat || "srt";
    }

    renderFileQueue();
    cancelUploadBtn.hidden = false;
    introFeatures.hidden = true;
    langStep.hidden = false;
    actionConsole.hidden = false;
    setTaskState("ready");
    updateScenePreview();
    updateTaskHeader();

    if (wasEmpty && state.files.length && sourceSelect.value === AUTO_DETECT_CODE) {
      const sampleCues = state.files[0]?.cues || [];
      const detected = await detectSourceLanguage(sampleCues);
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

  subtitleInput.addEventListener("change", async () => {
    if (subtitleInput.files?.length) {
      const result = await collectSourcesFromFiles(Array.from(subtitleInput.files));
      await ingestSources(result);
    }
    subtitleInput.value = "";
  });
  ["dragover", "dragenter"].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("dropzone--active"); }));
  ["dragleave", "drop"].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("dropzone--active"); }));
  dropzone.addEventListener("drop", async (e) => {
    const dataTransfer = (e as DragEvent).dataTransfer;
    if (!dataTransfer) return;
    const result = await collectSourcesFromDataTransfer(dataTransfer);
    await ingestSources(result);
  });

  cancelUploadBtn.addEventListener("click", resetAll);

  const cachedStats = getCachedDisplayStats();
  if (cachedStats) statsLine.textContent = t("stats.line", { ...cachedStats });
  refreshDisplayStats()
    .then((stats) => { if (stats) statsLine.textContent = t("stats.line", { ...stats }); })
    .catch(() => { if (!cachedStats) statsLine.textContent = ""; });
  listLocalHistoryJobs()
    .then((entries) => { localStatsLine.textContent = entries.length ? t("stats.local", { count: entries.length }) : ""; })
    .catch(() => {});

  function renderFile(file: SubtitleFile): { rendered: string; blob: Blob; filename: string } | null {
    if (!file.jobResult) return null;
    const format = effectiveFormat(file);
    const originalById = new Map(file.cues.map((c) => [c.id, c]));
    const rendered = renderSubtitle(format, file.jobResult.cues, originalById, file.renderMode, file.stacking);
    const outputFormat = file.sourceFormat ?? { encoding: "utf-8", bom: false, newline: "lf" as const };
    const blob = new Blob([encodeSubtitleText(rendered, outputFormat) as BlobPart], { type: "text/plain;charset=utf-8" });
    const filename = buildTranslatedFilename(
      file.filename, format, file.jobResult.resolved_source_lang || state.sourceLang, targetSelect.value, file.renderMode, file.stacking
    );
    file.downloadFilename = filename;
    return { rendered, blob, filename };
  }

  function downloadSingleFile(fileId: string) {
    const file = state.files.find((f) => f.id === fileId);
    const output = file && renderFile(file);
    if (!output) return;
    const url = URL.createObjectURL(output.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = output.filename;
    link.click();
    URL.revokeObjectURL(url);
    setTranslationCompletedNotDownloaded(false);
  }

  function openFilePreview(fileId: string) {
    const file = state.files.find((f) => f.id === fileId);
    if (!file?.jobResult) return;
    
    const leakedIds = new Set(file.jobResult.quality_warnings?.filter(w => w.leaked).map(w => w.cue_id));
    
    const cards: PreviewCard[] = file.jobResult.cues.map((c) => ({
      id: c.id, start: msToSrtTime(c.start_ms), end: msToSrtTime(c.end_ms), source: c.text, target: c.translation || "",
      start_ms: c.start_ms, end_ms: c.end_ms, targetLang: targetSelect.value,
      leaked: leakedIds.has(c.id)
    }));
    const originalById = new Map(file.cues.map((c) => [c.id, c]));
    const format = effectiveFormat(file);
    const sourceCues = file.jobResult.cues.map((c) => ({ ...c, translation: null }));
    openPreviewModal(
      renderSubtitle(format, file.jobResult.cues, originalById, file.renderMode, file.stacking),
      renderSubtitle(format, sourceCues, originalById, "monolingual", file.stacking),
      cards,
      {
        onApply: (edits, contextText, glossaryEntries) => applyPreviewEdits(file, edits, contextText, glossaryEntries),
        sceneSeconds: state.sceneSeconds,
        initialContext: state.contextText,
        initialGlossary: state.glossaryEntries,
        sourceFilename: file.filename,
        translatedFilename: file.downloadFilename,
        sourceLang: sourceSelect.value,
        targetLang: targetSelect.value,
      }
    );
  }

  function renderFileList() {
    if (state.files.length <= 1) {
      taskFileList.hidden = true;
      taskFileList.innerHTML = "";
      return;
    }
    taskFileList.hidden = false;
    taskFileList.innerHTML = state.files.map((file) => {
      const missing = file.jobResult?.missing_cues.length ?? 0;
      const statusIcon = missing === 0
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="task-file-row__status task-file-row__status--ok"><polyline points="20 6 9 17 4 12"></polyline></svg>`
        : `<span class="task-file-row__status task-file-row__status--warning">${missing}</span>`;
      return `
        <div class="task-file-row">
          ${statusIcon}
          <span class="task-file-row__name" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</span>
          <span class="task-file-row__actions">
            <button type="button" class="icon-btn" data-file-preview="${file.id}" aria-label="${t("preview.button")}">${EYE_ICON}</button>
            <button type="button" class="icon-btn" data-file-download="${file.id}" aria-label="${t("history.download")}">${DOWNLOAD_ICON}</button>
          </span>
        </div>
      `;
    }).join("");

    taskFileList.querySelectorAll<HTMLButtonElement>("[data-file-preview]").forEach((btn) => {
      btn.addEventListener("click", () => openFilePreview(btn.dataset.filePreview!));
    });
    taskFileList.querySelectorAll<HTMLButtonElement>("[data-file-download]").forEach((btn) => {
      btn.addEventListener("click", () => downloadSingleFile(btn.dataset.fileDownload!));
    });
  }

  downloadLink.addEventListener("click", () => {
    setTranslationCompletedNotDownloaded(false);
  });

  async function presentResult(elapsedMs?: number): Promise<void> {
    setTranslationCompletedNotDownloaded(true);
    if (lastDownloadUrl) {
      URL.revokeObjectURL(lastDownloadUrl);
      lastDownloadUrl = null;
    }

    if (state.files.length === 1) {
      const output = renderFile(state.files[0]);
      if (output) {
        lastDownloadUrl = URL.createObjectURL(output.blob);
        downloadLink.href = lastDownloadUrl;
        downloadLink.download = output.filename;
        downloadButtonLabel.textContent = `${t("download.button")} (${effectiveFormat(state.files[0]).toUpperCase()})`;
      }
    } else {
      const zipFiles = state.files
        .map((file) => {
          const output = renderFile(file);
          return output ? { path: withDirectoryOf(file.relativePath, output.filename), content: output.rendered } : null;
        })
        .filter((entry): entry is { path: string; content: string } => entry !== null);
      const zipBlob = await buildOutputZip(zipFiles);
      lastDownloadUrl = URL.createObjectURL(zipBlob);
      downloadLink.href = lastDownloadUrl;
      downloadLink.download = `translated_${targetSelect.value}.zip`;
      downloadButtonLabel.textContent = `${t("download.button")} (ZIP)`;
    }

    let missingTotal = 0;
    for (const file of state.files) missingTotal += file.jobResult?.missing_cues.length ?? 0;
    if (missingTotal === 0) {
      metricStatus.className = "task-metric__value task-metric__value--status";
      metricStatus.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>${t("task.status.done")}</span>`;
    } else {
      metricStatus.className = "task-metric__value task-metric__value--warning";
      metricStatus.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span>${t("task.quality.missingCues", { count: missingTotal.toLocaleString() })}</span>`;
    }
    if (metricStatusLbl) metricStatusLbl.textContent = t("field.status");

    metricCues.textContent = state.files.length.toLocaleString();
    if (metricCuesLbl) metricCuesLbl.textContent = t("field.cues");

    const elapsedSec = ((elapsedMs ?? 1000) / 1000).toFixed(1);
    metricElapsed.textContent = `${elapsedSec}s`;

    const compatibleFormats: SubtitleFormat[] = state.files.some((f) => f.originFormat !== "ass") ? ["srt", "vtt"] : ["ass"];
    taskFormatOptions.forEach((opt) => {
      const format = opt.getAttribute("data-format") as SubtitleFormat;
      opt.hidden = !compatibleFormats.includes(format);
      opt.classList.toggle("task-format-option--active", format === state.outputFormat);
    });
    taskFormatMenu.hidden = compatibleFormats.length < 2;

    previewButton.hidden = state.files.length > 1;
    renderFileList();

    setTaskState("completed", { elapsedMs });
  }

  taskFormatOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const fmt = option.getAttribute("data-format") as SubtitleFormat;
      if (!fmt || !state.files.some((f) => f.jobResult)) return;
      state.outputFormat = fmt;
      void presentResult();
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

  const taskStopLabel = q<HTMLElement>("#task-stop-label");
  let stopConfirming = false;
  let stopTimer: number | null = null;

  function resetStopBtn(): void {
    stopConfirming = false;
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    taskStopBtn.classList.remove("ghost-btn--confirm");
    if (taskStopLabel) taskStopLabel.textContent = t("task.stop");
  }

  let activeAbortController: AbortController | null = null;

  taskStopBtn.addEventListener("click", () => {
    if (!stopConfirming) {
      stopConfirming = true;
      taskStopBtn.classList.add("ghost-btn--confirm");
      if (taskStopLabel) taskStopLabel.textContent = t("task.stopConfirm");
      stopTimer = window.setTimeout(() => {
        resetStopBtn();
      }, 4000);
      return;
    }

    resetStopBtn();
    if (activeAbortController) {
      taskStopBtn.disabled = true;
      activeAbortController.abort();
      activeAbortController = null;
    }
  });

  function buildHistorySubtitles(): HistorySubtitle[] {
    return state.files.filter((f) => f.jobResult).map((file) => {
      const originalById = new Map(file.cues.map((c) => [c.id, c]));
      const historyCues = buildHistoryCues(file.jobResult!.cues, originalById);
      return {
        id: file.id,
        sourceFilename: file.filename,
        translatedFilename: file.downloadFilename,
        filename: file.downloadFilename,
        format: effectiveFormat(file),
        outputMode: file.renderMode,
        stacking: file.stacking,
        cues: historyCues,
        sourceFormat: file.sourceFormat || undefined,
        relativePath: file.relativePath,
      };
    });
  }

  startButton.addEventListener("click", async () => {
    if (!state.files.length) return;

    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;

    resetStopBtn();
    startButton.disabled = true;
    taskStopBtn.disabled = false;
    clearLogs();
    setTaskState("processing");
    totalFilesInRun = state.files.length;
    currentFileIndex = 0;
    taskProgressFill.className = "task-progress-fill task-progress-fill--indeterminate";
    taskProgressFill.style.width = "";
    updateFileProgress();

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

      let resolvedSourceLang = sourceLang;
      let actualProvider = state.provider;
      let hasSourceLangResolved = false;
      for (let i = 0; i < state.files.length; i++) {
        currentFileIndex = i;
        const file = state.files[i];
        progressLabel.textContent = totalFilesInRun > 1 ? t("progress.translatingFile", { name: file.filename }) : t("progress.translating");
        taskProgressFill.className = "task-progress-fill task-progress-fill--indeterminate";
        taskProgressFill.style.width = "";
        updateFileProgress();

        const { cues: wireCues } = applySdhStripping(file.cues, sourceLang, stripSdhEnabled);
        const job = await completeTranslateJob(
          { cues: wireCues, glossary, source: sourceLang, target: targetLang, provider: state.provider, sceneChangeSeconds, caseSensitiveTerms: state.caseSensitiveTerms, contextText, contextNeedsTranslation },
          appendLog,
          (chunk) => {
            const total = wireCues.length;
            if (total > 0 && chunk.cues) {
              const translatedCount = chunk.cues.filter((c) => c.translation !== null).length;
              updateFileProgress(translatedCount, total);
            }
          },
          signal
        );
        if (!job.success) {
          appendLog(`[warn] ${t("error.translationEmpty", { name: file.filename })}`);
          continue;
        }
        file.jobResult = job;
        file.renderMode = outputMode;
        file.stacking = state.stackingOrder;
        if (!hasSourceLangResolved) {
          resolvedSourceLang = job.resolved_source_lang || sourceLang;
          hasSourceLangResolved = true;
        }
        if (job.provider) actualProvider = job.provider;
      }
      if (!state.files.some((f) => f.jobResult)) throw new Error(t("error.allFilesFailed"));
      noteLocalTranslation();

      if (actualProvider !== state.provider) {
        appendLog(`[info] Requested provider '${state.provider}', but server routed to '${actualProvider}'`);
      }

      if (timerInterval) clearInterval(timerInterval);
      const elapsedMs = Math.max(100, Math.round(performance.now() - startTimestamp));

      if (sourceLang === AUTO_DETECT_CODE) {
        const known = SOURCE_LANGUAGES.some((l) => l.code === resolvedSourceLang.split("-")[0]);
        detectHint.textContent = known
          ? t("detect.done", { label: languageProfile(resolvedSourceLang).label, code: resolvedSourceLang })
          : t("detect.unknown", { code: resolvedSourceLang });
        detectHint.classList.add("detect-hint--done");
        updateTaskHeader();
      }

      progressLabel.textContent = t("progress.merging");
      await presentResult(elapsedMs);

      const historySubtitles = buildHistorySubtitles();
      const taskTitle = historySubtitles.length === 1 ? historySubtitles[0].translatedFilename! : fileCountLabel(historySubtitles.length);
      saveHistoryJob({
        engine: "nmt",
        provider: actualProvider,
        title: taskTitle,
        sourceFilename: historySubtitles[0]?.sourceFilename,
        translatedFilename: historySubtitles[0]?.translatedFilename,
        sourceLang: resolvedSourceLang,
        targetLang,
        subtitles: historySubtitles,
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
      if (signal.aborted) {
        appendLog("[info] Job cancelled by user.");
        setTaskState("failed", { errorText: t("error.cancelled"), completedCount: currentFileIndex, totalCount: state.files.length });
      } else {
        const errMessage = e instanceof Error ? e.message : String(e);
        appendLog(`[error] Translation failed: ${errMessage}`);
        setTaskState("failed", { errorText: formatWorkerError(e), completedCount: currentFileIndex, totalCount: state.files.length });
      }
    } finally {
      resetStopBtn();
      activeAbortController = null;
      startButton.disabled = false;
    }
  });

  function applyPreviewEdits(file: SubtitleFile, edits: Map<number, string>, contextText?: string, glossaryEntries?: DictionaryEntry[]): PreviewApplyResult {
    if (!file.jobResult) return {};
    file.jobResult = {
      ...file.jobResult,
      cues: file.jobResult.cues.map((c) => (edits.has(c.id) ? { ...c, translation: edits.get(c.id)! } : c)),
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
    void presentResult();
    const output = renderFile(file);
    if (!state.currentHistoryId) return { rawSrt: output?.rendered };

    const partial: any = { subtitles: buildHistorySubtitles() };
    if (contextText !== undefined) partial.contextText = contextText;
    if (glossaryEntries !== undefined) partial.glossary = entriesToGlossary(glossaryEntries);
    updateHistoryJob(state.currentHistoryId, partial).catch(() => {});
    return { rawSrt: output?.rendered };
  }

  previewButton.addEventListener("click", () => {
    if (state.files.length !== 1) return;
    openFilePreview(state.files[0].id);
  });

  document.addEventListener("click", (e) => {
    if (taskFormatMenu && taskFormatMenu.open && !taskFormatMenu.contains(e.target as Node)) {
      taskFormatMenu.open = false;
    }
  });

  renderFileQueue();
  if (state.files.length) {
    cancelUploadBtn.hidden = false;
    introFeatures.hidden = true;
    langStep.hidden = false;
    actionConsole.hidden = false;
    updateOutputModeVisibility();
    updateTaskHeader();
    updateScenePreview();
    if (state.files.some((f) => f.jobResult)) {
      void presentResult();
    } else {
      setTaskState("ready");
    }
  }
}
