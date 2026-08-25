import { DEFAULT_SCENE_CHANGE_SECONDS, previewChapterCount } from "../core/srtParse";
import { msToSrtTime } from "../core/srtRender";
import { detectFormat, parseSubtitle, renderSubtitle, withExtension, ACCEPTED_EXTENSIONS } from "../core/subtitleFormat";
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
import { HistoryCue, saveHistoryEntry, updateHistoryEntryCues, listHistoryEntries } from "../core/history";
import { historyEntryToCues, historyEntryToJobCues } from "../core/historyRender";
import { consumeHistoryRestore } from "../core/historyRestore";
import { getCachedDisplayStats, refreshDisplayStats, noteLocalTranslation } from "../core/remoteStats";
import { t } from "../i18n";

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
  const entry = consumeHistoryRestore("nmt");
  if (!entry) return false;
  state.currentFilename = entry.filename;
  state.downloadFilename = entry.filename;
  state.currentHistoryId = entry.id;
  state.sourceFormat = null;
  state.sourceLang = entry.sourceLang;
  state.targetLang = entry.targetLang;
  state.outputMode = entry.outputMode;
  state.stackingOrder = entry.stacking;
  state.userPickedOutputMode = true;
  state.lastFormat = entry.format;
  state.lastRenderMode = entry.outputMode;
  state.lastStacking = entry.stacking;
  state.lastCues = historyEntryToCues(entry);
  state.lastJobResult = {
    success: true,
    resolved_source_lang: entry.sourceLang,
    cues: historyEntryToJobCues(entry),
    missing_count: 0,
    missing_cues: [],
    approx_splits: [],
    quality_warnings: [],
  };
  state.glossaryEntries = entry.glossary ? glossaryToEntries(entry.glossary) : [];
  return true;
}

export function mount(container: HTMLElement, _signal: AbortSignal): void {
  hydrateFromHistory();
  renderApp(container);
}

function renderApp(container: HTMLElement) {
  container.innerHTML = `
    <header class="tool-header">
      <h1>${t("app.title")}</h1>
      <p class="brand-tag">${t("app.tagline")}</p>
      <p class="muted">${t("app.description")}</p>
      <p class="muted" id="stats-line"></p>
      <p class="muted" id="local-stats-line"></p>
    </header>

    <section class="step">
      <div class="step__head"><span class="step__num">1</span><span class="step__title">${t("step.upload.title")}</span></div>
      <label class="dropzone" id="dropzone">
        <div class="dropzone__icon">↑</div>
        <div class="dropzone__title">${t("dropzone.title")}</div>
        <div class="dropzone__hint">${t("dropzone.hint")}</div>
        <div class="dropzone__file" id="dropzone-file"></div>
        <input type="file" id="subtitle-file" accept="${ACCEPTED_EXTENSIONS.join(",")}" />
      </label>
    </section>

    <section class="step" id="lang-step" ${state.lastCues.length ? "" : "hidden"}>
      <div class="step__head"><span class="step__num">2</span><span class="step__title">${t("step.lang.title")}</span></div>
      <div class="field-row">
        <label class="field">
          <span>${t("field.sourceLang")}</span>
          <select id="source-lang"></select>
          <span class="detect-hint" id="detect-hint"></span>
        </label>
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
      <label class="field">
        <span>${t("context.label")}</span>
        <textarea id="context-input" rows="3" placeholder="${t("context.placeholder")}"></textarea>
        <span class="field__counter" id="context-counter">${state.contextText.trim().length}/${CONTEXT_MAX_CHARS}</span>
        <div class="slider-field__hint" id="context-hint"></div>
      </label>
    </section>

    <section class="step" id="start-step" ${state.lastCues.length ? "" : "hidden"}>
      <button id="start" class="primary">${t("start.button")}</button>
    </section>

    <section class="step" id="progress-card" hidden>
      <div class="progress-row">
        <span id="progress-label">${t("progress.preparing")}</span>
        <span id="progress-count"></span>
      </div>
      <progress id="progress-bar" max="100" value="0"></progress>
      <pre class="log" id="log"></pre>
    </section>

    <section class="step" id="result-card" ${state.lastJobResult ? "" : "hidden"}>
      <p id="result-summary"></p>
      <div class="result-actions">
        <button id="preview-button" class="secondary">${t("preview.button")}</button>
        <a id="download-link" class="primary" download>${t("download.button")}</a>
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
  const subtitleInput = q<HTMLInputElement>("#subtitle-file");
  const langStep = q<HTMLElement>("#lang-step");
  const startStep = q<HTMLElement>("#start-step");
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
  const startButton = q<HTMLButtonElement>("#start");
  const progressCard = q<HTMLElement>("#progress-card");
  const progressLabel = q<HTMLElement>("#progress-label");
  const progressCount = q<HTMLElement>("#progress-count");
  const progressBar = q<HTMLProgressElement>("#progress-bar");
  const logEl = q<HTMLElement>("#log");
  const resultCard = q<HTMLElement>("#result-card");
  const resultSummary = q<HTMLElement>("#result-summary");
  const downloadLink = q<HTMLAnchorElement>("#download-link");
  const previewButton = q<HTMLButtonElement>("#preview-button");
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

  targetSelect.addEventListener("change", () => { state.targetLang = targetSelect.value; updateOutputModeVisibility(); });
  sourceSelect.addEventListener("change", () => {
    state.sourceLang = sourceSelect.value;
    updateOutputModeVisibility();
    detectHint.textContent = sourceSelect.value === AUTO_DETECT_CODE && state.lastCues.length ? t("detect.auto") : "";
    detectHint.classList.remove("detect-hint--done");
    if (sourceSelect.value !== AUTO_DETECT_CODE) loadDictionaryFor(sourceSelect.value);
  });

  function syncSceneSlider() {
    sceneSecondsInput.value = String(clamp(state.sceneSeconds, SCENE_SLIDER_MIN, SCENE_SLIDER_MAX));
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
  });
  sceneSecondsNumber.addEventListener("input", () => {
    const parsed = Math.round(Number(sceneSecondsNumber.value));
    if (!Number.isFinite(parsed)) return;
    state.sceneSeconds = clamp(parsed, SCENE_SECONDS_MIN, SCENE_SECONDS_MAX);
    syncSceneSlider();
    updateScenePreview();
  });
  sceneSecondsNumber.addEventListener("blur", () => { sceneSecondsNumber.value = String(state.sceneSeconds); });
  sdhToggle.addEventListener("change", () => { state.sdhEnabled = sdhToggle.checked; });
  caseSensitiveToggle.addEventListener("change", () => { state.caseSensitiveTerms = caseSensitiveToggle.checked; });
  contextInput.addEventListener("input", () => {
    state.contextText = contextInput.value;
    const length = state.contextText.trim().length;
    const overLimit = length > CONTEXT_MAX_CHARS;
    contextCounter.textContent = `${length}/${CONTEXT_MAX_CHARS}`;
    contextCounter.classList.toggle("field__counter--over", overLimit);
    contextHint.textContent = overLimit ? t("context.tooLong", { max: CONTEXT_MAX_CHARS }) : "";
  });

  function appendLog(message: string) {
    logEl.textContent += `${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  async function handleFile(file: File) {
    state.currentFilename = file.name;
    state.downloadFilename = "";
    state.currentHistoryId = null;
    state.lastJobResult = null;
    resultCard.hidden = true;
    const { text: content, format } = decodeSubtitleBytes(new Uint8Array(await file.arrayBuffer()));
    state.sourceFormat = format;
    dropzoneFile.textContent = t("dropzone.selected", { name: file.name });
    langStep.hidden = false;
    startStep.hidden = false;

    state.lastCues = parseSubtitle(detectFormat(file.name), content);
    updateScenePreview();

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
    }
  }

  subtitleInput.addEventListener("change", () => { if (subtitleInput.files?.[0]) handleFile(subtitleInput.files[0]); });
  ["dragover", "dragenter"].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("dropzone--active"); }));
  ["dragleave", "drop"].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("dropzone--active"); }));
  dropzone.addEventListener("drop", (e) => {
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  const cachedStats = getCachedDisplayStats();
  if (cachedStats) statsLine.textContent = t("stats.line", { ...cachedStats });
  refreshDisplayStats()
    .then((stats) => { if (stats) statsLine.textContent = t("stats.line", { ...stats }); })
    .catch(() => { if (!cachedStats) statsLine.textContent = ""; });
  listHistoryEntries()
    .then((entries) => { localStatsLine.textContent = entries.length ? t("stats.local", { count: entries.length }) : ""; })
    .catch(() => {});

  function presentResult(job: TranslateJobResponse): string {
    const originalById = new Map(state.lastCues.map((c) => [c.id, c]));
    const rendered = renderSubtitle(state.lastFormat, job.cues, originalById, state.lastRenderMode, state.lastStacking);
    const outputFormat = state.sourceFormat ?? { encoding: "utf-8", bom: false, newline: "lf" as const };
    const blob = new Blob([encodeSubtitleText(rendered, outputFormat) as BlobPart], { type: "text/plain;charset=utf-8" });
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = state.downloadFilename;
    resultSummary.textContent = t("result.summary", {
      cues: job.cues.length, missing: job.missing_count, splits: job.approx_splits.length, skipped: job.missing_cues.length,
      warnings: job.quality_warnings.length,
    });
    resultCard.hidden = false;
    return rendered;
  }

  startButton.addEventListener("click", async () => {
    if (!state.lastCues.length) return;

    startButton.disabled = true;
    progressCard.hidden = false;
    resultCard.hidden = true;
    logEl.textContent = "";
    progressBar.removeAttribute("value");
    progressCount.textContent = "";

    try {
      const sourceLang = sourceSelect.value;
      const targetLang = targetSelect.value;
      const outputMode = state.outputMode;
      const sceneChangeSeconds = state.sceneSeconds;
      const stripSdhEnabled = sdhToggle.checked;

      progressLabel.textContent = t("progress.translating");
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
      }

      progressBar.value = 100;
      progressLabel.textContent = t("progress.merging");
      state.downloadFilename = withExtension(state.currentFilename, state.lastFormat, targetLang);
      presentResult(job);

      const cueSettingsById = new Map(state.lastCues.map((c) => [c.id, c.cueSettings]));
      const historyCues: HistoryCue[] = job.cues.map((c) => ({
        id: c.id, start_ms: c.start_ms, end_ms: c.end_ms, sourceText: c.text, translatedText: c.translation ?? "", cueSettings: cueSettingsById.get(c.id),
      }));
      saveHistoryEntry({
        engine: "nmt",
        filename: state.downloadFilename,
        sourceLang: job.resolved_source_lang,
        targetLang,
        format: state.lastFormat,
        outputMode: state.lastRenderMode,
        stacking: state.lastStacking,
        cues: historyCues,
        glossary: Object.keys(glossary).length ? glossary : undefined,
      }).then((id) => {
        state.currentHistoryId = id;
        listHistoryEntries().then((entries) => { localStatsLine.textContent = t("stats.local", { count: entries.length }); }).catch(() => {});
      }).catch(() => {});

      progressLabel.textContent = t("progress.done");
    } catch (e) {
      appendLog(t("error.prefix", { message: e instanceof Error ? e.message : String(e) }));
      progressLabel.textContent = t("progress.failed");
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

  function applyPreviewEdits(edits: Map<number, string>): PreviewApplyResult {
    if (!state.lastJobResult) return {};
    state.lastJobResult = {
      ...state.lastJobResult,
      cues: state.lastJobResult.cues.map((c) => (edits.has(c.id) ? { ...c, translation: edits.get(c.id)! } : c)),
    };
    const rawSrt = presentResult(state.lastJobResult);
    if (!state.currentHistoryId) return { rawSrt };
    const cueSettingsById = new Map(state.lastCues.map((c) => [c.id, c.cueSettings]));
    const historyCues: HistoryCue[] = state.lastJobResult.cues.map((c) => ({
      id: c.id, start_ms: c.start_ms, end_ms: c.end_ms, sourceText: c.text, translatedText: c.translation ?? "", cueSettings: cueSettingsById.get(c.id),
    }));
    updateHistoryEntryCues(state.currentHistoryId, historyCues).catch(() => {});
    return { rawSrt };
  }

  previewButton.addEventListener("click", () => {
    if (!state.lastJobResult) return;
    const missingSet = new Set(state.lastJobResult.missing_cues);
    const warningByCue = new Map(state.lastJobResult.quality_warnings.map((w) => [w.cue_id, w]));
    const cards: PreviewCard[] = state.lastJobResult.cues.map((c) => {
      const warning = warningByCue.get(c.id);
      return {
        id: c.id, start: msToSrtTime(c.start_ms), end: msToSrtTime(c.end_ms), source: c.text, target: c.translation || "",
        missing: missingSet.has(c.id), warningReason: warning ? warningReasonOf(warning) : undefined,
      };
    });
    const originalById = new Map(state.lastCues.map((c) => [c.id, c]));
    openPreviewModal(
      renderSubtitle(state.lastFormat, state.lastJobResult.cues, originalById, state.lastRenderMode, state.lastStacking),
      cards,
      { onApply: applyPreviewEdits }
    );
  });

  if (state.lastJobResult) presentResult(state.lastJobResult);
}
