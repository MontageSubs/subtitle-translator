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
import { buildPath, navigate } from '../router/router';
import { getLocale, t } from "../i18n";
import { setPageMeta } from '../config/head';
import { formatDateTime } from '../utils/formatDate';
import { glossaryToEntries } from '../utils/dictionary';
import { UPLOAD_ICON, DOWNLOAD_ICON, TRASH_ICON } from "../render/icons";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
      const isImported = Boolean(job.historyId && job.historyId !== currentHistoryId);
      const originBadge = isImported
        ? `<span class="history-origin-badge history-origin-badge--imported">${t("history.originImported")}</span>`
        : "";

      const subtitleSnippet = subCount > 1
        ? `<div class="muted" style="font-size: 0.8rem; margin-top: 4px;">${job.subtitles.map((s) => escapeHtml(s.filename)).join(" · ")}</div>`
        : "";

      return `
        <div class="history-row" data-job-id="${job.id}" role="button" tabindex="0" aria-label="${escapeHtml(job.title)}">
          <div class="history-row__info">
            <div class="history-row__name">
              <span class="history-row__engine">${job.engine.toUpperCase()}</span>
              <span>${escapeHtml(job.title)}</span>
              ${originBadge}
            </div>
            <div class="history-row__meta">
              ${escapeHtml(job.sourceLang)} → ${escapeHtml(job.targetLang)} · ${totalCues} ${t("history.cues")} ${subCount > 1 ? `(${subCount})` : ""} · ${formatDateTime(job.updatedAt)}
            </div>
            ${subtitleSnippet}
          </div>
          <div class="history-row__actions">
            <button type="button" class="secondary" data-restore="${job.id}">${t("history.restore")}</button>
            <button type="button" class="secondary" data-download="${job.id}">${t("history.download")}</button>
            <button type="button" class="secondary" data-delete="${job.id}">${t("history.delete")}</button>
          </div>
        </div>
      `;
    }).join("");

    const findJob = (id: string | undefined) => jobs.find((j) => j.id === id);

    listEl.querySelectorAll<HTMLElement>("[data-job-id]").forEach((row) => {
      const jobId = row.dataset.jobId!;
      const job = findJob(jobId);
      if (!job) return;

      const activate = () => {
        if (job.subtitles.length > 0) {
          openSubtitlePreview(job.id, job.subtitles[0].id);
        }
      };

      row.addEventListener("click", activate);
      row.addEventListener("keydown", (e) => {
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
        if (job && job.subtitles.length > 0) {
          downloadSubtitle(job.subtitles[0], false);
        }
      });
    });

    listEl.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteHistoryJob(btn.dataset.delete!);
        render();
      });
    });
  }

  render();
}
