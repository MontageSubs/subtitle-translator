import { labelAttrs } from "../../utils/labelAttrs";
import { renderEngineLabel, renderLanguagePair } from "../../utils/historyLabels";
import { getLocale, t } from "../../i18n";
import type { HistorySummary } from "../../lib/history/history";
import { CHEVRON_DOWN_ICON, DOWNLOAD_ICON, EDIT_ICON, EYE_ICON } from "../../render/icons";
import { escapeHtml } from "../../utils/escapeHtml";
import { formatDateTime } from "../../utils/localeFormat";

export interface JobRowState {
  expanded: boolean;
  renaming: boolean;
  deleteStage: "idle" | "confirming" | "pending";
  undoSeconds: number;
  imported: boolean;
}

function renderTitle(job: HistorySummary, renaming: boolean): string {
  const title = escapeHtml(job.title);
  const input = renaming
    ? `<input type="text" class="history-row__rename-input" data-rename-input="${job.id}" value="${title}" placeholder="${t("history.renamePlaceholder")}" aria-label="${t("history.rename")}" />`
    : "";
  return `<span class="history-row__title" title="${title}">${title}</span><button type="button" class="icon-btn icon-btn--sm history-row__rename-btn" data-rename="${job.id}" ${labelAttrs(t("history.rename"))}${renaming ? " disabled" : ""}>${EDIT_ICON}</button>${input}`;
}

function renderSubtitleActions(subtitle: HistorySummary["files"][number]): string {
  if (subtitle.incomplete) return `<span class="history-row__file-note">${t("history.fileIncomplete")}</span>`;
  return `
                <button type="button" class="icon-btn" data-sub-preview="${subtitle.id}" ${labelAttrs(t("preview.button"))}>${EYE_ICON}</button>
                <button type="button" class="icon-btn" data-sub-download="${subtitle.id}" ${labelAttrs(t("history.download"))}>${DOWNLOAD_ICON}</button>`;
}

function renderSubtitleRow(subtitle: HistorySummary["files"][number]): string {
  const name = escapeHtml(subtitle.name);
  return `
            <div class="history-row__file" data-sub-row="${subtitle.id}">
              <bdi class="history-row__file-name" title="${name}">${name}</bdi>
              <span class="history-row__file-actions">${renderSubtitleActions(subtitle)}
              </span>
            </div>
          `;
}

function renderStatusBadge(job: HistorySummary): string {
  const modifier = job.incomplete ? "incomplete" : "complete";
  return `<span class="history-status-badge history-status-badge--${modifier}">${t(job.incomplete ? "history.status.incomplete" : "history.status.complete")}</span>`;
}

function renderMeta(job: HistorySummary, cueCount: number): string {
  const fileCount = job.files.length > 1 ? `(${job.files.length})` : "";
  return `${renderLanguagePair(job)} · ${t("history.cueCount", { count: cueCount })} ${fileCount} · ${formatDateTime(job.updatedAt, getLocale())}`;
}

export function renderJobRow(job: HistorySummary, state: JobRowState): string {
  const grouped = job.files.length > 1;
  const { cueCount } = job;
  const origin = state.imported ? `<span class="history-origin-badge history-origin-badge--imported">${t("history.originImported")}</span>` : "";
  const files = grouped && state.expanded ? `<div class="history-row__files">${job.files.map(renderSubtitleRow).join("")}</div>` : "";
  const expandIcon = grouped ? `<span class="history-row__expand-icon ${state.expanded ? "history-row__expand-icon--open" : ""}">${CHEVRON_DOWN_ICON}</span>` : "";
  const deleteLabel = { idle: t("history.delete"), confirming: t("history.confirmDelete"), pending: t("common.undoCountdown", { seconds: state.undoSeconds }) }[state.deleteStage];
  const title = escapeHtml(job.title);

  return `
        <div class="history-row ${grouped ? "history-row--group" : ""}${state.deleteStage === "pending" ? " history-row--pending-delete" : ""}" data-job-id="${job.id}">
          <div class="history-row__main" role="button" tabindex="0" aria-label="${title}" aria-expanded="${grouped ? state.expanded : ""}">
            <div class="history-row__info">
              <div class="history-row__name">
                <span class="history-row__engine">${renderEngineLabel(job)}</span>
                ${renderTitle(job, state.renaming)}
                ${renderStatusBadge(job)}
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
              <button type="button" class="secondary${state.deleteStage === "confirming" ? " is-confirming" : state.deleteStage === "pending" ? " is-undoing" : ""}" data-delete="${job.id}">${deleteLabel}</button>
            </div>
          </div>
          ${files}
        </div>
      `;
}
