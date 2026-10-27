import { getLocale, t, type TranslationKey } from "../../i18n";
import { MODEL_KINDS } from "../../lib/models/kinds";
import type { ModelStatus, ModelView } from "../../lib/models/manager";
import type { ModelFailure } from "../../lib/models/types";
import { MODEL_HUB_ORIGIN } from "../../config/models";
import { CHEVRON_DOWN_ICON, renderExternalLinkIcon } from "../../render/icons";
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

const hubLink = (repository: string): string => `<a href="${MODEL_HUB_ORIGIN}/${escapeHtml(repository)}" target="_blank" rel="noopener">${escapeHtml(repository)}${renderExternalLinkIcon(t("a11y.opensInNewTab"))}</a>`;

function renderMeta(view: ModelView): string {
  const { manifest, record } = view;
  const locale = getLocale();
  const rows: [TranslationKey, string][] = [
    ["models.meta.repository", hubLink(manifest.repository)],
    ...(manifest.upstreamRepository ? [["models.meta.upstream", hubLink(manifest.upstreamRepository)] as [TranslationKey, string]] : []),
    ["models.meta.size", escapeHtml(formatMegabytes(record?.bytes ?? manifest.sizeHint, locale))],
    ["models.meta.version", escapeHtml(record?.version ?? manifest.version)],
    ["models.meta.languages", escapeHtml(manifest.languages.map((code) => languageName(code, locale)).join(", "))],
    ["models.meta.author", escapeHtml(manifest.author)],
  ];
  if (record) rows.push(["models.meta.installedAt", escapeHtml(formatDate(record.installedAt, locale))]);
  return rows.map(([key, value]) => `<div><dt>${t(key)}</dt><dd>${value}</dd></div>`).join("");
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

function renderActions(view: ModelView): string {
  const button = (action: string, label: TranslationKey, primary = false): string => `<button type="button" class="${primary ? "primary" : "secondary"}" data-action="${action}">${t(label)}</button>`;
  const discard = view.staged.length ? button("discard", "models.action.discardStaged") : "";
  switch (view.status) {
    case "absent": return button("install", view.staged.length ? "models.action.downloadMissing" : "models.action.install", true) + discard;
    case "failed": return button("install", "models.action.retry", true) + discard;
    case "downloading": return button("pause", "models.action.pause") + button("cancel", "models.action.cancel");
    case "paused": return button("install", "models.action.resume", true) + button("cancel", "models.action.cancel");
    case "installed": return (view.updateAvailable ? button("install", "models.action.update", true) : "") + button(view.record?.enabled ? "disable" : "enable", view.record?.enabled ? "models.action.disable" : "models.action.enable") + button("remove", "models.action.remove") + discard;
    default: return "";
  }
}

function renderTools(view: ModelView): string {
  const busy = view.status === "downloading" || view.status === "paused" || view.status === "verifying" || view.status === "unsupported";
  const importButton = busy ? "" : `<button type="button" class="action-pill" data-action="import">${t("models.action.importFile")}</button><input type="file" accept=".zip,.onnx,.json,.txt" multiple hidden data-import-input />`;
  const packageLink = view.manifest.packageUrl ? `<a class="action-pill" href="${escapeHtml(view.manifest.packageUrl)}" target="_blank" rel="noopener">${t("models.action.downloadPackage")}</a>` : "";
  return importButton || packageLink ? `<div class="model-row__tools">${packageLink}${importButton}</div>` : "";
}

export function renderModelRow(view: ModelView, expanded: boolean, shownPercent?: number): string {
  const { manifest } = view;
  const modifier = BADGE_MODIFIER[view.status];
  const name = escapeHtml(t(manifest.nameKey));
  const detailsId = `model-details-${manifest.id}`;
  return `
    <div class="history-row model-row" data-model="${escapeHtml(manifest.id)}" data-status="${view.status}">
      <div class="history-row__main model-row__main">
        <div class="history-row__info">
          <div class="history-row__name">
            <span class="history-row__engine">${t(MODEL_KINDS[manifest.kind].labelKey)}</span>
            <span class="history-row__title" title="${name}">${name}</span>
            <span class="history-status-badge${modifier ? ` history-status-badge--${modifier}` : ""}" data-status-label>${escapeHtml(statusLabel(view))}</span>
          </div>
          <div class="history-row__meta">${escapeHtml(t(manifest.descriptionKey))}</div>
          <div class="model-row__source">${hubLink(manifest.repository)}</div>
        </div>
        <div class="history-row__actions">
          ${renderActions(view)}
          <button type="button" class="icon-btn model-row__toggle" data-action="toggle" aria-expanded="${expanded}" aria-controls="${detailsId}" aria-label="${escapeHtml(t("models.action.details"))}"><span class="history-row__expand-icon${expanded ? " history-row__expand-icon--open" : ""}">${CHEVRON_DOWN_ICON}</span></button>
        </div>
      </div>
      ${renderProgress(view, shownPercent)}
      ${renderNote(view)}
      <div class="model-row__details" id="${detailsId}"${expanded ? "" : " hidden"}>
        <dl class="model-row__meta">${renderMeta(view)}</dl>
        ${renderChecksums(view)}
        ${renderTools(view)}
      </div>
    </div>`;
}
