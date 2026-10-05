import { t } from "../../i18n";
import { HistoryJob, HistorySubtitle } from "../../lib/history/history";
import { CHEVRON_DOWN_ICON, DOWNLOAD_ICON, EDIT_ICON, EYE_ICON, renderDirectionArrow } from "../../render/icons";
import { escapeHtml } from "../../utils/escapeHtml";
import { formatDateTime } from "../../utils/formatDate";

export interface JobRowState {
  expanded: boolean;
  renaming: boolean;
  confirmingDelete: boolean;
  imported: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  "microsoft-nmt-edge": "Microsoft NMT",
};
const DEFAULT_PROVIDER_LABEL = "Google NMT";

function renderEngineLabel(job: HistoryJob): string {
  const provider = job.provider ? ` · ${escapeHtml(PROVIDER_LABELS[job.provider] ?? DEFAULT_PROVIDER_LABEL)}` : "";
  return `${job.engine.toUpperCase()}${provider}`;
}

function renderTitle(job: HistoryJob, renaming: boolean): string {
  if (renaming) {
    return `<input type="text" class="history-row__rename-input" data-rename-input="${job.id}" value="${escapeHtml(job.title)}" placeholder="${t("history.renamePlaceholder")}" />`;
  }
  return `<span>${escapeHtml(job.title)}</span><button type="button" class="icon-btn history-row__rename-btn" data-rename="${job.id}" aria-label="${t("history.rename")}">${EDIT_ICON}</button>`;
}

function renderSubtitleRow(subtitle: HistorySubtitle): string {
  const name = escapeHtml(subtitle.filename);
  return `
            <div class="history-row__file" data-sub-row="${subtitle.id}">
              <span class="history-row__file-name" title="${name}">${name}</span>
              <span class="history-row__file-actions">
                <button type="button" class="icon-btn" data-sub-preview="${subtitle.id}" aria-label="${t("preview.button")}">${EYE_ICON}</button>
                <button type="button" class="icon-btn" data-sub-download="${subtitle.id}" aria-label="${t("history.download")}">${DOWNLOAD_ICON}</button>
              </span>
            </div>
          `;
}

function renderMeta(job: HistoryJob, cueCount: number): string {
  const fileCount = job.subtitles.length > 1 ? `(${job.subtitles.length})` : "";
  return `${escapeHtml(job.sourceLang)} ${renderDirectionArrow(12)} ${escapeHtml(job.targetLang)} · ${cueCount} ${t("history.cues")} ${fileCount} · ${formatDateTime(job.updatedAt)}`;
}

export function renderJobRow(job: HistoryJob, state: JobRowState): string {
  const grouped = job.subtitles.length > 1;
  const cueCount = job.subtitles.reduce((sum, subtitle) => sum + subtitle.cues.length, 0);
  const origin = state.imported ? `<span class="history-origin-badge history-origin-badge--imported">${t("history.originImported")}</span>` : "";
  const files = grouped && state.expanded ? `<div class="history-row__files">${job.subtitles.map(renderSubtitleRow).join("")}</div>` : "";
  const expandIcon = grouped ? `<span class="history-row__expand-icon ${state.expanded ? "history-row__expand-icon--open" : ""}">${CHEVRON_DOWN_ICON}</span>` : "";
  const deleteLabel = state.confirmingDelete ? t("history.confirmDelete") : t("history.delete");
  const title = escapeHtml(job.title);

  return `
        <div class="history-row ${grouped ? "history-row--group" : ""}" data-job-id="${job.id}">
          <div class="history-row__main" role="button" tabindex="0" aria-label="${title}" aria-expanded="${grouped ? state.expanded : ""}">
            <div class="history-row__info">
              <div class="history-row__name">
                <span class="history-row__engine">${renderEngineLabel(job)}</span>
                ${renderTitle(job, state.renaming)}
                ${origin}
              </div>
              <div class="history-row__meta">
                ${renderMeta(job, cueCount)}
              </div>
            </div>
            <div class="history-row__actions">
              ${expandIcon}
              <button type="button" class="secondary" data-restore="${job.id}">${t("history.restore")}</button>
              <button type="button" class="secondary" data-download="${job.id}">${t("history.download")}</button>
              <button type="button" class="secondary${state.confirmingDelete ? " secondary--danger-confirm" : ""}" data-delete="${job.id}">${deleteLabel}</button>
            </div>
          </div>
          ${files}
        </div>
      `;
}
