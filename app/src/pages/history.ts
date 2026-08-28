import {
  HistoryJob,
  HistorySubtitle,
  HistoryCue,
  listHistoryJobs,
  getHistoryJob,
  deleteHistoryJob,
  updateHistoryJob,
  clearHistory,
  exportHistoryJson,
  importHistoryJson,
  getHistoryId,
} from '../lib/history/history';
import { renderHistorySubtitle } from '../lib/history/historyRender';
import { requestHistoryRestore } from '../lib/history/historyRestore';
import { openPreviewModal, PreviewCard } from "../components/previewModal";
import { msToSrtTime } from '../lib/subtitle/srtRender';
import { buildOutputZip, withDirectoryOf } from '../lib/subtitle/archive';
import { escapeHtml } from '../utils/escapeHtml';
import { buildPath, navigate } from '../router/router';
import { getLocale, t } from "../i18n";
import { setPageMeta } from '../config/head';
import { formatDateTime } from '../utils/formatDate';
import { glossaryToEntries } from '../utils/dictionary';
import { UPLOAD_ICON, DOWNLOAD_ICON, TRASH_ICON, EYE_ICON, CHEVRON_DOWN_ICON } from "../render/icons";

function mimeFor(format: HistorySubtitle["format"]): string {
  return format === "vtt" ? "text/vtt;charset=utf-8" : "text/plain;charset=utf-8";
}

function downloadSubtitle(sub: HistorySubtitle, isSource = false): void {
  const content = renderHistorySubtitle(sub, isSource);
  const blob = new Blob([content], { type: mimeFor(sub.format) });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = isSource ? (sub.sourceFilename || `source_${sub.filename}`) : (sub.translatedFilename || sub.filename);
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadJobAsZip(job: HistoryJob): Promise<void> {
  const files = job.subtitles.map((sub) => ({
    path: withDirectoryOf(sub.relativePath, sub.translatedFilename || sub.filename),
    content: renderHistorySubtitle(sub, false),
  }));
  const blob = await buildOutputZip(files);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${job.title || "subtitles"}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}

function toPreviewCards(sub: HistorySubtitle, targetLang: string): PreviewCard[] {
  return sub.cues.map((c) => ({
    id: c.id,
    start: msToSrtTime(c.start_ms),
    end: msToSrtTime(c.end_ms),
    source: c.sourceText,
    target: c.translatedText,
    start_ms: c.start_ms,
    end_ms: c.end_ms,
    targetLang,
  }));
}

async function openSubtitlePreview(jobId: string, subtitleId: string): Promise<void> {
  const job = await getHistoryJob(jobId);
  if (!job) return;
  const sub = job.subtitles.find((s) => s.id === subtitleId) || job.subtitles[0];
  if (!sub) return;

  const rawTarget = renderHistorySubtitle(sub, false);
  const rawSource = renderHistorySubtitle(sub, true);
  const cards = toPreviewCards(sub, job.targetLang);

  openPreviewModal(rawTarget, rawSource, cards, {
    lastUpdatedLabel: t("preview.lastUpdated", { date: formatDateTime(job.updatedAt) }),
    initialContext: job.contextText,
    initialGlossary: job.glossary ? glossaryToEntries(job.glossary) : undefined,
    sceneSeconds: job.sceneSeconds,
    sourceFilename: sub.sourceFilename || job.sourceFilename || "subtitle.srt",
    translatedFilename: sub.translatedFilename || job.translatedFilename || sub.filename || "translated.srt",
    onApply: (edits, contextText, glossaryEntries) => {
      const updatedCues: HistoryCue[] = sub.cues.map((c) =>
        edits.has(c.id) ? { ...c, translatedText: edits.get(c.id)! } : c
      );
      sub.cues = updatedCues;

      const partial: Partial<HistoryJob> = {
        subtitles: job.subtitles.map((s) => (s.id === sub.id ? { ...s, cues: updatedCues } : s)),
      };
      if (contextText !== undefined) partial.contextText = contextText;
      if (glossaryEntries !== undefined) {
        partial.glossary = glossaryEntries.length
          ? glossaryEntries.reduce((acc, e) => {
              if (e.source.trim()) acc[e.source.trim()] = e.target.trim();
              return acc;
            }, {} as Record<string, string>)
          : undefined;
      }

      updateHistoryJob(job.id, partial).then((updated) => {
        if (!updated) return;
        job.updatedAt = updated.updatedAt;
      }).catch(() => {});

      return {
        lastUpdatedLabel: t("preview.lastUpdated", { date: formatDateTime(Date.now()) }),
        rawSrt: renderHistorySubtitle(sub, false),
      };
    },
  });
}

function restoreJob(job: HistoryJob): void {
  requestHistoryRestore(job);
  navigate(buildPath(getLocale(), "nmt"));
}

export function mount(container: HTMLElement, _signal: AbortSignal): void {
  setPageMeta(t("nav.history"), t("meta.history.description"));
  container.innerHTML = `
    <section class="step">
      <div class="history-page-header">
        <h1 class="history-page-title">${t("nav.history")}</h1>
        <div class="history-action-group">
          <input type="file" id="history-import-input" accept=".json" style="display: none;" />
          <button type="button" class="action-pill" id="history-import-btn" title="${t("history.import")}" aria-label="${t("history.import")}">
            ${UPLOAD_ICON} <span>${t("history.import")}</span>
          </button>
          <button type="button" class="action-pill" id="history-export-btn" title="${t("history.export")}" aria-label="${t("history.export")}">
            ${DOWNLOAD_ICON} <span>${t("history.export")}</span>
          </button>
          <button type="button" class="action-pill action-pill--danger" id="history-clear" title="${t("history.clearAll")}" aria-label="${t("history.clearAll")}">
            ${TRASH_ICON} <span id="history-clear-label">${t("history.clearAll")}</span>
          </button>
        </div>
      </div>
      <div class="history-list" id="history-list"></div>
    </section>
  `;

  const listEl = container.querySelector<HTMLElement>("#history-list")!;
  const importInput = container.querySelector<HTMLInputElement>("#history-import-input")!;
  const importBtn = container.querySelector<HTMLButtonElement>("#history-import-btn")!;
  const exportBtn = container.querySelector<HTMLButtonElement>("#history-export-btn")!;
  const clearBtn = container.querySelector<HTMLButtonElement>("#history-clear")!;
  const clearLabel = container.querySelector<HTMLElement>("#history-clear-label")!;

  let clearConfirming = false;
  let clearTimer: number | null = null;

  function resetClearBtn(): void {
    clearConfirming = false;
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    clearBtn.classList.remove("action-pill--danger-confirm");
    clearLabel.textContent = t("history.clearAll");
  }

  clearBtn.addEventListener("click", async () => {
    if (!clearConfirming) {
      clearConfirming = true;
      clearBtn.classList.add("action-pill--danger-confirm");
      clearLabel.textContent = t("history.confirmClear");
      clearTimer = window.setTimeout(() => {
        resetClearBtn();
      }, 4000);
      return;
    }

    resetClearBtn();
    await clearHistory();
    render();
  });

  exportBtn.addEventListener("click", async () => {
    const json = await exportHistoryJson();
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `subtitle-translator-history-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener("click", () => {
    importInput.value = "";
    importInput.click();
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importHistoryJson(text);
      render();
    } catch {
      
    }
  });

  const expandedJobIds = new Set<string>();

  async function render(): Promise<void> {
    const currentHistoryId = getHistoryId();
    const jobs = await listHistoryJobs();
    if (!jobs.length) {
      listEl.innerHTML = `<p class="muted history-empty">${t("history.empty")}</p>`;
      return;
    }

    listEl.innerHTML = jobs.map((job) => {
      const totalCues = job.subtitles.reduce((sum, s) => sum + s.cues.length, 0);
      const subCount = job.subtitles.length;
      const isExpanded = expandedJobIds.has(job.id);
      const isImported = Boolean(job.historyId && job.historyId !== currentHistoryId);
      const originBadge = isImported
        ? `<span class="history-origin-badge history-origin-badge--imported">${t("history.originImported")}</span>`
        : "";

      const fileList = subCount > 1 && isExpanded
        ? `<div class="history-row__files">${job.subtitles.map((sub) => `
            <div class="history-row__file" data-sub-row="${sub.id}">
              <span class="history-row__file-name" title="${escapeHtml(sub.filename)}">${escapeHtml(sub.filename)}</span>
              <span class="history-row__file-actions">
                <button type="button" class="icon-btn" data-sub-preview="${sub.id}" aria-label="${t("preview.button")}">${EYE_ICON}</button>
                <button type="button" class="icon-btn" data-sub-download="${sub.id}" aria-label="${t("history.download")}">${DOWNLOAD_ICON}</button>
              </span>
            </div>
          `).join("")}</div>`
        : "";

      return `
        <div class="history-row ${subCount > 1 ? "history-row--group" : ""}" data-job-id="${job.id}">
          <div class="history-row__main" role="button" tabindex="0" aria-label="${escapeHtml(job.title)}" aria-expanded="${subCount > 1 ? isExpanded : ""}">
            <div class="history-row__info">
              <div class="history-row__name">
                <span class="history-row__engine">${job.engine.toUpperCase()}${job.provider ? ` · ${escapeHtml(job.provider === 'microsoft-nmt-edge' ? 'Microsoft NMT' : 'Google NMT')}` : ''}</span>
                <span>${escapeHtml(job.title)}</span>
                ${originBadge}
              </div>
              <div class="history-row__meta">
                ${escapeHtml(job.sourceLang)} → ${escapeHtml(job.targetLang)} · ${totalCues} ${t("history.cues")} ${subCount > 1 ? `(${subCount})` : ""} · ${formatDateTime(job.updatedAt)}
              </div>
            </div>
            <div class="history-row__actions">
              ${subCount > 1 ? `<span class="history-row__expand-icon ${isExpanded ? "history-row__expand-icon--open" : ""}">${CHEVRON_DOWN_ICON}</span>` : ""}
              <button type="button" class="secondary" data-restore="${job.id}">${t("history.restore")}</button>
              <button type="button" class="secondary" data-download="${job.id}">${t("history.download")}</button>
              <button type="button" class="secondary" data-delete="${job.id}">${t("history.delete")}</button>
            </div>
          </div>
          ${fileList}
        </div>
      `;
    }).join("");

    const findJob = (id: string | undefined) => jobs.find((j) => j.id === id);

    listEl.querySelectorAll<HTMLElement>("[data-job-id]").forEach((row) => {
      const jobId = row.dataset.jobId!;
      const job = findJob(jobId);
      if (!job) return;
      const main = row.querySelector<HTMLElement>(".history-row__main")!;

      const activate = () => {
        if (job.subtitles.length === 1) {
          openSubtitlePreview(job.id, job.subtitles[0].id);
          return;
        }
        if (expandedJobIds.has(job.id)) expandedJobIds.delete(job.id);
        else expandedJobIds.add(job.id);
        render();
      };

      main.addEventListener("click", activate);
      main.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });
    });

    listEl.querySelectorAll<HTMLButtonElement>("[data-restore]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const job = findJob(btn.dataset.restore);
        if (job) restoreJob(job);
      });
    });

    listEl.querySelectorAll<HTMLButtonElement>("[data-download]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const job = findJob(btn.dataset.download);
        if (!job || !job.subtitles.length) return;
        if (job.subtitles.length === 1) downloadSubtitle(job.subtitles[0], false);
        else downloadJobAsZip(job);
      });
    });

    listEl.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteHistoryJob(btn.dataset.delete!);
        render();
      });
    });

    listEl.querySelectorAll<HTMLButtonElement>("[data-sub-preview]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = btn.closest<HTMLElement>("[data-job-id]");
        const job = findJob(row?.dataset.jobId);
        if (job) openSubtitlePreview(job.id, btn.dataset.subPreview!);
      });
    });

    listEl.querySelectorAll<HTMLButtonElement>("[data-sub-download]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = btn.closest<HTMLElement>("[data-job-id]");
        const job = findJob(row?.dataset.jobId);
        const sub = job?.subtitles.find((s) => s.id === btn.dataset.subDownload);
        if (sub) downloadSubtitle(sub, false);
      });
    });
  }

  render();
}
