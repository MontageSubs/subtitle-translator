import { getLocale, t, type TranslationKey } from "../../i18n";
import type { ModelStatus, ModelView } from "../../lib/models/manager";
import type { ModelFailure } from "../../lib/models/types";
import { modelAnchor } from "../../lib/models/catalog";
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
const VISIBLE_LANGUAGES = 3;
const BUSY_STATUSES: readonly ModelStatus[] = ["downloading", "paused", "verifying"];

export const percentOf = ({ loaded, total }: ModelView): number => (total ? Math.min(PERCENT_SCALE, Math.floor((loaded / total) * PERCENT_SCALE)) : 0);

export function statusLabel(view: ModelView): string {
  switch (view.status) {
    case "unsupported": return t("models.status.unsupported");
    case "absent": return t("models.status.absent");
    case "downloading": return t("models.status.downloading");
    case "paused": return t("models.status.paused");
    case "verifying": return t("models.status.verifying");
    case "failed": return t("models.status.failed");
    case "installed": return view.updateAvailable ? t("models.status.updateAvailable") : view.record?.enabled ? t("models.status.enabled") : t("models.status.disabled");
  }
}

export const progressDetail = (view: ModelView): string => {
  const locale = getLocale();
  return t("models.progress.detail", { loaded: formatMegabytes(view.loaded, locale), total: formatMegabytes(view.total, locale) });
};

function renderChips(view: ModelView): string {
  const { manifest, record } = view;
  const locale = getLocale();
  const names = manifest.languages.map((code) => languageName(code, locale));
  const shown = names.slice(0, VISIBLE_LANGUAGES).join(", ");
  const languages = names.length > VISIBLE_LANGUAGES ? `${shown} +${names.length - VISIBLE_LANGUAGES}` : shown;
  const chips = [languages, formatMegabytes(record?.bytes ?? manifest.sizeHint, locale)];
  return chips.map((chip) => `<li class="hub-chip">${escapeHtml(chip)}</li>`).join("");
}

function renderMeta(view: ModelView): string {
  const { manifest, record } = view;
  const locale = getLocale();
  const repositoryLink = `<a href="${MODEL_HUB_ORIGIN}/${escapeHtml(manifest.repository)}" target="_blank" rel="noopener">${escapeHtml(manifest.repository)}${renderExternalLinkIcon(t("a11y.opensInNewTab"))}</a>`;
  const rows: [TranslationKey, string, boolean][] = [
    ["models.meta.languages", escapeHtml(manifest.languages.map((code) => languageName(code, locale)).join(", ")), true],
    ["models.meta.version", escapeHtml(record?.version ?? manifest.version), false],
    ["models.meta.size", escapeHtml(formatMegabytes(record?.bytes ?? manifest.sizeHint, locale)), false],
    ["models.meta.author", escapeHtml(manifest.author), false],
  ];
  if (record) rows.push([record.updated ? "models.meta.updatedAt" : "models.meta.installedAt", escapeHtml(formatDate(record.installedAt, locale)), false]);
  rows.push(["models.meta.repository", repositoryLink, true]);
  return `<dl class="hub-meta">${rows.map(([key, value, wide]) => `<div${wide ? ' class="hub-meta__wide"' : ""}><dt>${t(key)}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
}

export const failureMessage = (view: ModelView): string | null => (view.failure ? t(FAILURE_KEYS[view.failure]) : null);

export function stagedMessage(view: ModelView): string {
  const missing = view.manifest.files.filter(({ name }) => !view.staged.includes(name)).map(({ name }) => name);
  return t("models.staged.summary", { received: view.staged.join(", "), missing: missing.join(", ") || "—" });
}

function renderStatusNotes(view: ModelView): string {
  const notes: string[] = [];
  if (view.status === "unsupported" && view.incompatibility) {
    notes.push(`<div class="hub-note"><h4 class="hub-note__title">${t("models.unsupported.title")}</h4><p>${escapeHtml(t(`models.unsupported.${view.incompatibility}` as TranslationKey))} ${escapeHtml(t("models.unsupported.hint"))}</p></div>`);
  }
  if (view.status === "failed" && view.failure) {
    notes.push(`<div class="hub-note"><p>${failureMessage(view)}${view.detail ? ` <code class="hub-note__code">${escapeHtml(view.detail)}</code>` : ""}</p></div>`);
  }
  if (view.staged.length) notes.push(`<div class="hub-note"><p>${escapeHtml(stagedMessage(view))}</p></div>`);
  if (view.manifest.deprecated && view.record) notes.push(`<div class="hub-note"><p>${t("models.deprecated.note")}</p></div>`);
  return notes.join("");
}

function renderChecksums(view: ModelView): string {
  const hashes = Object.entries(view.record?.hashes ?? {});
  if (!hashes.length) return "";
  return `<details class="hub-verify"><summary>${t("models.meta.checksum")}</summary><code>${hashes.map(([name, hash]) => `${escapeHtml(hash)}  ${escapeHtml(name)}`).join("\n")}</code></details>`;
}

function renderProgress(view: ModelView, shownPercent?: number): string {
  if (!BUSY_STATUSES.includes(view.status)) return "";
  const percent = percentOf(view);
  const shown = shownPercent ?? percent;
  const verifying = view.status === "verifying";
  return `
    <div class="hub-card__progress">
      <div class="task-progress-head">
        <span class="task-processing-label" id="model-progress-${view.manifest.id}">${escapeHtml(view.manifest.name)}</span>
        <span class="task-timer" data-progress-detail>${verifying ? escapeHtml(t("models.status.verifying")) : escapeHtml(progressDetail(view))}</span>
      </div>
      <div class="task-progress-container" role="progressbar" aria-labelledby="model-progress-${view.manifest.id}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
        <div class="task-progress-fill${verifying ? " task-progress-fill--indeterminate" : ""}" data-progress-fill style="width:${verifying ? 100 : shown}%"></div>
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
    case "installed": return (view.updateAvailable && !view.manifest.deprecated ? pill("install", "models.action.update", true) : "") + pill(view.record?.enabled ? "disable" : "enable", view.record?.enabled ? "models.action.disable" : "models.action.enable") + pill("remove", "models.action.remove") + discard;
    default: return "";
  }
}

function renderImport(view: ModelView): string {
  const blocked = BUSY_STATUSES.includes(view.status) || view.status === "unsupported";
  const packageLink = view.manifest.packageUrl ? `<a class="action-pill" href="${escapeHtml(view.manifest.packageUrl)}" target="_blank" rel="noopener">${t("models.action.downloadPackage")}</a>` : "";
  const importButton = blocked ? "" : `<button type="button" class="action-pill" data-action="import">${t("models.action.importFile")}</button><input type="file" accept=".zip,.onnx,.json,.txt" multiple hidden data-import-input />`;
  return importButton || packageLink ? `<div class="hub-card__import">${packageLink}${importButton}</div>` : "";
}

export function renderModelCard(view: ModelView, expanded: boolean, shownPercent?: number, undoSeconds: number | null = null): string {
  const { manifest } = view;
  const modifier = BADGE_MODIFIER[view.status];
  const name = escapeHtml(manifest.name);
  const detailsId = `model-details-${manifest.id}`;
  const actions = renderActions(view, undoSeconds);
  return `
    <article class="hub-card${expanded ? " hub-card--expanded" : ""}" id="${escapeHtml(modelAnchor(manifest))}" data-model="${escapeHtml(manifest.id)}" data-status="${view.status}">
      <header class="hub-card__header">
        <h3 class="hub-card__name"><button type="button" class="hub-card__toggle" data-action="toggle" aria-expanded="${expanded}" aria-controls="${detailsId}">${name}</button></h3>
        <span class="history-status-badge${modifier ? ` history-status-badge--${modifier}` : ""}" data-status-label>${escapeHtml(statusLabel(view))}</span>
        <span class="hub-card__chevron${expanded ? " hub-card__chevron--open" : ""}" aria-hidden="true">${CHEVRON_DOWN_ICON}</span>
      </header>
      <p class="hub-card__description">${escapeHtml(t(manifest.descriptionKey))}</p>
      <ul class="hub-card__chips">${renderChips(view)}</ul>
      ${renderProgress(view, shownPercent)}
      ${actions ? `<div class="hub-card__actions">${actions}</div>` : ""}
      <div class="hub-card__details" id="${detailsId}"${expanded ? "" : " hidden"}>
        ${renderStatusNotes(view)}
        ${renderMeta(view)}
        ${renderChecksums(view)}
        ${renderImport(view)}
      </div>
    </article>`;
}
