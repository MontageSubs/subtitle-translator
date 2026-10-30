import { labelAttrs } from "../utils/labelAttrs";
import { listHistorySummaries, HistorySummary } from "../lib/history/history";
import { getLocale, t } from "../i18n";
import { CLOSE_ICON, CHEVRON_DOWN_ICON, UPLOAD_ICON, renderDirectionArrow } from "../render/icons";
import { escapeHtml } from "../utils/escapeHtml";
import { renderEngineLabel, renderLanguagePair } from "../utils/historyLabels";
import { formatDateTime } from "../utils/localeFormat";
import { matchesSearchIndex, normalizeSearchText } from "../utils/offlineSearch";
import { Glossary } from "../lib/subtitle/types";
import { openModal } from "./modal";

export type ImportType = "context" | "glossary";

export interface HistoryImportResult {
  contextText?: string;
  glossary?: Glossary;
  caseSensitiveTerms?: boolean;
}

interface ImportSource {
  titleKey: "history.importContextTitle" | "history.importGlossaryTitle";
  actionKey: "history.importThisContext" | "history.importThisGlossary";
  isAvailable(job: HistorySummary): boolean;
  searchableText(job: HistorySummary): string;
  fingerprint(job: HistorySummary): string;
  countLabel(job: HistorySummary): string;
  renderPreview(job: HistorySummary): string;
  toResult(job: HistorySummary): HistoryImportResult;
}

const IMPORT_SOURCES: Record<ImportType, ImportSource> = {
  context: {
    titleKey: "history.importContextTitle",
    actionKey: "history.importThisContext",
    isAvailable: (job) => Boolean(job.contextText?.trim()),
    searchableText: (job) => job.contextText ?? "",
    fingerprint: (job) => (job.contextText ?? "").trim(),
    countLabel: (job) => t("history.charsCount", { count: job.contextText?.length ?? 0 }),
    renderPreview: (job) => `<div class="history-job-card__preview-box">${escapeHtml(job.contextText ?? "")}</div>`,
    toResult: (job) => ({ contextText: job.contextText }),
  },
  glossary: {
    titleKey: "history.importGlossaryTitle",
    actionKey: "history.importThisGlossary",
    isAvailable: (job) => Object.keys(job.glossary ?? {}).length > 0,
    searchableText: (job) => Object.entries(job.glossary ?? {}).map(([source, target]) => `${source} ${target}`).join("\n"),
    fingerprint: (job) => JSON.stringify([job.caseSensitiveTerms ?? false, Object.entries(job.glossary ?? {}).sort(([a], [b]) => a.localeCompare(b))]),
    countLabel: (job) => t("history.termsCount", { count: Object.keys(job.glossary ?? {}).length }),
    renderPreview: (job) => `<div class="history-job-card__glossary-grid">${Object.entries(job.glossary ?? {}).map(([source, target]) => `
            <div class="history-job-card__glossary-tag">
              <span class="src">${escapeHtml(source)}</span>
              <span class="arrow">${renderDirectionArrow(12)}</span>
              <span class="tgt">${escapeHtml(target)}</span>
            </div>`).join("")}</div>`,
    toResult: (job) => ({ glossary: job.glossary, caseSensitiveTerms: job.caseSensitiveTerms }),
  },
};

function renderJobCard(job: HistorySummary, source: ImportSource, expanded: boolean): string {
  const countLabel = source.countLabel(job);
  const body = expanded
    ? `<div class="history-job-card__body">
              ${source.renderPreview(job)}
              <div class="history-job-card__footer">
                <span class="muted muted--sm">${countLabel}</span>
                <button type="button" class="action-pill action-pill--accent" data-import-id="${job.id}">
                  ${UPLOAD_ICON} <span>${t(source.actionKey)}</span>
                </button>
              </div>
            </div>`
    : "";
  return `
          <div class="history-job-card ${expanded ? "history-job-card--expanded" : ""}" data-card-id="${job.id}">
            <div class="history-job-card__head" data-toggle-id="${job.id}" role="button" tabindex="0" aria-expanded="${expanded}">
              <div>
                <div class="history-job-card__title">
                  <span class="tag">${renderEngineLabel(job)}</span>
                  <bdi class="history-job-card__name" title="${escapeHtml(job.title)}">${escapeHtml(job.title)}</bdi>
                </div>
                <div class="history-job-card__meta">
                  ${renderLanguagePair(job)} · ${countLabel} · ${formatDateTime(job.updatedAt, getLocale())}
                </div>
              </div>
              <div class="history-job-card__expand-icon">${CHEVRON_DOWN_ICON}</div>
            </div>
            ${body}
          </div>`;
}

function renderShell(title: string): string {
  return `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="history-import-title" style="max-width: 680px; max-height: 85vh;">
      <div class="modal__head">
        <h2 id="history-import-title" class="modal__title">
          ${title}
        </h2>
        <button type="button" class="icon-btn modal__close" ${labelAttrs(t("preview.close"))}>${CLOSE_ICON}</button>
      </div>
      <div class="modal__body modal__body--padded">
        <div class="preview-search-wrap history-import-search">
          <input type="search" class="preview-search" id="history-import-search" placeholder="${t("history.searchJobs")}" aria-label="${t("history.searchJobs")}" />
          <button type="button" class="preview-search-clear icon-btn" id="history-import-search-clear" ${labelAttrs(t("preview.clearSearch"))} hidden>${CLOSE_ICON}</button>
        </div>
        <div id="history-import-list" class="history-import-list"></div>
      </div>
    </div>
  `;
}

export function openHistoryImportModal(type: ImportType, onSelect: (result: HistoryImportResult) => void): void {
  const source = IMPORT_SOURCES[type];
  const modal = openModal({ html: renderShell(t(source.titleKey)) });
  const list = modal.query<HTMLElement>("#history-import-list");
  const searchInput = modal.query<HTMLInputElement>("#history-import-search");
  const clearButton = modal.query<HTMLButtonElement>("#history-import-search-clear");
  const expandedIds = new Set<string>();
  let candidates: { job: HistorySummary; haystack: string }[] = [];

  function visibleJobs(): HistorySummary[] {
    return candidates.filter(({ haystack }) => matchesSearchIndex(searchInput.value, haystack)).map(({ job }) => job);
  }

  function render(): void {
    const visible = visibleJobs();
    list.innerHTML = visible.length
      ? visible.map((job) => renderJobCard(job, source, expandedIds.has(job.id))).join("")
      : `<p class="muted empty-state">${t("history.noMatchingJobs")}</p>`;
  }

  function toggle(jobId: string): void {
    const expanded = !expandedIds.delete(jobId);
    if (expanded) expandedIds.add(jobId);
    const card = list.querySelector<HTMLElement>(`[data-card-id="${jobId}"]`);
    const job = candidates.find((candidate) => candidate.job.id === jobId)?.job;
    if (card && job) card.outerHTML = renderJobCard(job, source, expanded);
    list.querySelector<HTMLElement>(`[data-toggle-id="${jobId}"]`)?.focus({ preventScroll: true });
  }

  list.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const importId = target.closest<HTMLElement>("[data-import-id]")?.dataset.importId;
    const toggleId = target.closest<HTMLElement>("[data-toggle-id]")?.dataset.toggleId;
    if (importId) {
      const job = candidates.find((candidate) => candidate.job.id === importId)?.job;
      if (!job) return;
      onSelect(source.toResult(job));
      modal.close();
    } else if (toggleId) {
      toggle(toggleId);
    }
  }, { signal: modal.signal });

  list.addEventListener("keydown", (event) => {
    const head = (event.target as HTMLElement).closest<HTMLElement>("[data-toggle-id]");
    if (!head || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggle(head.dataset.toggleId!);
  }, { signal: modal.signal });

  searchInput.addEventListener("input", () => {
    clearButton.hidden = searchInput.value.length === 0;
    render();
  }, { signal: modal.signal });
  clearButton.addEventListener("click", () => {
    searchInput.value = "";
    clearButton.hidden = true;
    searchInput.focus();
    render();
  }, { signal: modal.signal });

  void listHistorySummaries().then((all) => {
    if (modal.signal.aborted) return;
    const seen = new Set<string>();
    candidates = all.filter(source.isAvailable).filter((job) => {
      const fingerprint = source.fingerprint(job);
      return !seen.has(fingerprint) && seen.add(fingerprint);
    }).map((job) => ({
      job,
      haystack: normalizeSearchText([job.title, `${job.sourceLang} ${job.targetLang}`, source.searchableText(job)].join("\n")),
    }));
    render();
    searchInput.focus();
  });
}
