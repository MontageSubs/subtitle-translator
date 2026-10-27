import { getLocale, t, type TranslationKey } from "../../i18n";
import type { ModelStatus, ModelView } from "../../lib/models/manager";
import type { ModelFailure } from "../../lib/models/types";
import { MODEL_HUB_ORIGIN } from "../../config/models";
import { CHEVRON_DOWN_ICON, UNDO_ICON, renderExternalLinkIcon } from "../../render/icons";
import { escapeHtml } from "../../utils/escapeHtml";
import { languageName } from "../../utils/languageNames";
import { formatDate, formatMegabytes } from "../../utils/localeFormat";

const FAILURE_KEYS: Record<ModelFailure, TranslationKey> = {
  network: "models.failure.network",
  integrity: "models.failure.integrity",
  unavailable: "models.failure.unavailable",
  storage: "models.failure.storage",
  archive: "models.failure.archive",
  missing: "models.failure.missing",
  mismatch: "models.failure.mismatch",
};

const BADGE_MODIFIER: Partial<Record<ModelStatus, string>> = { installed: "complete", failed: "incomplete", unsupported: "incomplete" };
const PERCENT_SCALE = 100;

export const percentOf = ({ loaded, total }: ModelView): number => (total ? Math.min(PERCENT_SCALE, Math.floor((loaded / total) * PERCENT_SCALE)) : 0);

export function statusLabel(view: ModelView): string {
  switch (view.status) {
    case "unsupported": return t("models.status.unsupported");
    case "absent": return t("models.status.absent");
    case "downloading": return t("models.status.downloading", { percent: percentOf(view) });
    case "paused": return t("models.status.paused", { percent: percentOf(view) });
    case "verifying": return t("models.status.verifying");
    case "failed": return t("models.status.failed");
    case "installed": return view.updateAvailable ? t("models.status.updateAvailable") : view.record?.enabled ? t("models.status.enabled") : t("models.status.disabled");
  }
}

export const progressDetail = (view: ModelView): string => {
  const locale = getLocale();
  return t("models.progress.detail", { loaded: formatMegabytes(view.loaded, locale), total: formatMegabytes(view.total, locale) });
};

function renderMeta(view: ModelView): string {
  const { manifest, record } = view;
  const locale = getLocale();
  const rows: [TranslationKey, string][] = [
    ["models.meta.languages", manifest.languages.map((code) => languageName(code, locale)).join(", ")],
    ["models.meta.version", record?.version ?? manifest.version],
    ["models.meta.size", formatMegabytes(record?.bytes ?? manifest.sizeHint, locale)],
    ["models.meta.author", manifest.author],
  ];
  if (record) rows.push([record.updated ? "models.meta.updatedAt" : "models.meta.installedAt", formatDate(record.installedAt, locale)]);
  return rows.map(([key, value]) => `<div><dt>${t(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
}

function renderRepository(view: ModelView): string {
  const { repository } = view.manifest;
  return `<div class="model-row__checksums"><span>${t("models.meta.repository")}</span><a href="${MODEL_HUB_ORIGIN}/${escapeHtml(repository)}" target="_blank" rel="noopener">${escapeHtml(repository)}${renderExternalLinkIcon(t("a11y.opensInNewTab"))}</a></div>`;
}

function renderChecksums(view: ModelView): string {
  const hashes = Object.entries(view.record?.hashes ?? {});
  if (!hashes.length) return "";
  return `<div class="model-row__checksums"><span>${t("models.meta.checksum")}</span><code>${hashes.map(([name, hash]) => `${escapeHtml(hash)}  ${escapeHtml(name)}`).join("\n")}</code></div>`;
}

function renderNote(view: ModelView): string {
  const notes: string[] = [];
  if (view.staged.length) {
    const missing = view.manifest.files.filter(({ name }) => !view.staged.includes(name)).map(({ name }) => name);
    notes.push(`<p class="model-row__note" role="status">${escapeHtml(t("models.staged.summary", { received: view.staged.join(", "), missing: missing.join(", ") || "—" }))}</p>`);
  }
  if (view.status === "failed" && view.failure) notes.push(`<p class="model-row__note model-row__note--warning" role="alert">${t(FAILURE_KEYS[view.failure])}${view.detail ? ` <code class="model-row__detail">${escapeHtml(view.detail)}</code>` : ""}</p>`);
  return notes.join("");
}

function renderProgress(view: ModelView, shownPercent?: number): string {
  if (view.status !== "downloading" && view.status !== "paused" && view.status !== "verifying") return "";
  const percent = percentOf(view);
  const shown = shownPercent ?? percent;
  const name = escapeHtml(t(view.manifest.nameKey));
  return `
    <div class="model-row__progress">
      <div class="task-progress-head">
        <span class="task-processing-label" id="model-progress-${view.manifest.id}">${name}</span>
        <span class="task-timer" data-progress-detail>${view.status === "verifying" ? escapeHtml(t("models.status.verifying")) : escapeHtml(progressDetail(view))}</span>
      </div>
      <div class="task-progress-container" role="progressbar" aria-labelledby="model-progress-${view.manifest.id}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
        <div class="task-progress-fill${view.status === "verifying" ? " task-progress-fill--indeterminate" : ""}" data-progress-fill style="width:${view.status === "verifying" ? 100 : shown}%"></div>
      </div>
    </div>`;
}

function renderActions(view: ModelView, undoSeconds: number | null): string {
  const pill = (action: string, label: TranslationKey, accent = false): string => `<button type="button" class="action-pill${accent ? " action-pill--accent" : ""}" data-action="${action}">${t(label)}</button>`;
  if (undoSeconds !== null) return `<button type="button" class="action-pill is-undoing" data-action="remove">${UNDO_ICON}<span data-undo-label>${t("common.undoCountdown", { seconds: undoSeconds })}</span></button>`;
  const discard = view.staged.length ? pill("discard", "models.action.discardStaged") : "";
  switch (view.status) {
    case "absent": return pill("install", view.staged.length ? "models.action.downloadMissing" : "models.action.install", true) + discard;
    case "failed": return pill("install", "models.action.retry", true) + discard;
    case "downloading": return pill("pause", "models.action.pause") + pill("cancel", "models.action.cancel");
    case "paused": return pill("install", "models.action.resume", true) + pill("cancel", "models.action.cancel");
    case "installed": return (view.updateAvailable ? pill("install", "models.action.update", true) : "") + pill(view.record?.enabled ? "disable" : "enable", view.record?.enabled ? "models.action.disable" : "models.action.enable") + pill("remove", "models.action.remove") + discard;
    default: return "";
  }
}

function renderTools(view: ModelView): string {
  const busy = view.status === "downloading" || view.status === "paused" || view.status === "verifying" || view.status === "unsupported";
  const importButton = busy ? "" : `<button type="button" class="action-pill" data-action="import">${t("models.action.importFile")}</button><input type="file" accept=".zip,.onnx,.json,.txt" multiple hidden data-import-input />`;
  const packageLink = view.manifest.packageUrl ? `<a class="action-pill" href="${escapeHtml(view.manifest.packageUrl)}" target="_blank" rel="noopener">${t("models.action.downloadPackage")}</a>` : "";
  return importButton || packageLink ? `<div class="model-row__tools">${packageLink}${importButton}</div>` : "";
}

export function renderModelRow(view: ModelView, expanded: boolean, shownPercent?: number, undoSeconds: number | null = null): string {
  const { manifest } = view;
  const modifier = BADGE_MODIFIER[view.status];
  const name = escapeHtml(t(manifest.nameKey));
  const detailsId = `model-details-${manifest.id}`;
  return `
    <div class="history-row model-row${undoSeconds !== null ? " history-row--pending-delete" : ""}" data-model="${escapeHtml(manifest.id)}" data-status="${view.status}">
      <div class="history-row__main model-row__main" role="button" tabindex="0" data-action="toggle" aria-expanded="${expanded}" aria-controls="${detailsId}" aria-label="${name}">
        <div class="history-row__info">
          <div class="history-row__name">
            <span class="history-row__title" title="${name}">${name}</span>
            <span class="history-status-badge${modifier ? ` history-status-badge--${modifier}` : ""}" data-status-label>${escapeHtml(statusLabel(view))}</span>
          </div>
          <small class="muted">${escapeHtml(manifest.repository)}</small>
          <div class="history-row__meta">${escapeHtml(t(manifest.descriptionKey))}</div>
        </div>
        <div class="history-row__actions">
          ${renderActions(view, undoSeconds)}
          <span class="history-row__expand-icon${expanded ? " history-row__expand-icon--open" : ""}">${CHEVRON_DOWN_ICON}</span>
        </div>
      </div>
      ${renderProgress(view, shownPercent)}
      ${renderNote(view)}
      <div class="model-row__details" id="${detailsId}"${expanded ? "" : " hidden"}>
        <dl class="model-row__meta">${renderMeta(view)}</dl>
        ${renderChecksums(view)}
        ${renderRepository(view)}
        ${renderTools(view)}
      </div>
    </div>`;
}
