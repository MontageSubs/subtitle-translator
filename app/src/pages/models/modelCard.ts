import { getLocale, t, type TranslationKey } from "../../i18n";
import { applicableFiles } from "../../lib/models/backends";
import { isDownloadable, type ModelStatus, type ModelView } from "../../lib/models/manager";
import { PROVIDER_LABELS } from "../../lib/models/compatibility";
import type { ModelFailure } from "../../lib/models/types";
import { modelAnchor, modelDescription } from "../../lib/models/catalog";
import { MODEL_KINDS } from "../../lib/models/kinds";
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

const percentOf = ({ loaded, total }: ModelView): number => (total ? Math.min(PERCENT_SCALE, Math.floor((loaded / total) * PERCENT_SCALE)) : 0);

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

function renderLanguageChip(names: readonly string[]): string {
  const shown = names.slice(0, VISIBLE_LANGUAGES).join(", ");
  if (names.length <= VISIBLE_LANGUAGES) return `<li class="model-chip">${escapeHtml(shown)}</li>`;
  const full = escapeHtml(t("models.chip.languages", { languages: names.join(", ") }));
  return `<li class="model-chip model-chip--hint" title="${full}">${escapeHtml(`${shown} +${names.length - VISIBLE_LANGUAGES}`)}</li>`;
}

function renderChips(view: ModelView): string {
  const { manifest, record } = view;
  const locale = getLocale();
  const names = manifest.languages.map((code) => languageName(code, locale));
  return `${renderLanguageChip(names)}<li class="model-chip">${escapeHtml(formatMegabytes(record?.bytes ?? manifest.sizeHint, locale))}</li>`;
}

function renderSource(view: ModelView): string {
  const { homepage } = view.manifest;
  const label = escapeHtml(homepage.replace(/^https?:\/\//, ""));
  const link = `<a class="model-source__link" href="${escapeHtml(homepage)}" target="_blank" rel="noopener" title="${label}"><span class="model-source__name">${label}</span>${renderExternalLinkIcon(t("a11y.opensInNewTab"))}</a>`;
  return `<div class="model-meta__wide"><dt>${t("models.meta.source")}</dt><dd class="model-source">${link}${renderImport(view)}</dd></div>`;
}

function renderMeta(view: ModelView): string {
  const { manifest, record } = view;
  const locale = getLocale();
  const rows: [TranslationKey, string, boolean][] = [
    ["models.meta.languages", escapeHtml(manifest.languages.map((code) => languageName(code, locale)).join(", ")), true],
    ["models.meta.version", escapeHtml(record?.version ?? manifest.version), false],
    ["models.meta.size", escapeHtml(formatMegabytes(record?.bytes ?? manifest.sizeHint, locale)), false],
    ["models.meta.author", escapeHtml(manifest.author), false],
  ];
  if (record) rows.push([record.updated ? "models.meta.updatedAt" : "models.meta.installedAt", escapeHtml(formatDate(record.installedAt, locale)), false]);
  const fields = rows.map(([key, value, wide]) => `<div${wide ? ' class="model-meta__wide"' : ""}><dt>${t(key)}</dt><dd>${value}</dd></div>`).join("");
  return `<dl class="model-meta">${fields}${renderSource(view)}</dl>`;
}

export const failureMessage = (view: ModelView): string | null => (view.failure ? t(FAILURE_KEYS[view.failure]) : null);

export function stagedMessage(view: ModelView): string {
  const missing = applicableFiles(view.manifest).filter(({ name }) => !view.staged.includes(name)).map(({ name }) => name);
  return t("models.staged.summary", { received: view.staged.join(", "), missing: missing.join(", ") || "—" });
}

function renderStatusNotes(view: ModelView): string {
  const notes: string[] = [];
  if (view.status === "unsupported" && view.incompatibility) {
    const reason = view.incompatibility === "cache" ? t("models.unsupported.cache") : t("models.unsupported.provider", { technology: PROVIDER_LABELS[view.incompatibility] });
    notes.push(`<div class="model-note"><h4 class="model-note__title">${t("models.unsupported.title")}</h4><p>${escapeHtml(reason)} ${escapeHtml(t("models.unsupported.hint"))}</p></div>`);
  }
  if (view.status === "absent" && !isDownloadable(view.manifest)) notes.push(`<div class="model-note"><p>${t("models.package.upload")}</p></div>`);
  if (view.status === "failed" && view.failure) {
    notes.push(`<div class="model-note"><p>${failureMessage(view)}${view.detail ? ` <code class="model-note__code">${escapeHtml(view.detail)}</code>` : ""}</p></div>`);
  }
  if (view.staged.length) notes.push(`<div class="model-note"><p>${escapeHtml(stagedMessage(view))}</p></div>`);
  if (view.manifest.deprecated && view.record) notes.push(`<div class="model-note"><p>${t("models.deprecated.note")}</p></div>`);
  return notes.join("");
}

function renderChecksums(view: ModelView): string {
  const { files, package: archive } = view.manifest;
  const known = [...(archive?.sha256 ? [[archive.sha256, archive.url.split("/").pop() ?? ""]] : []), ...files.flatMap(({ name, sha256 }) => (sha256 ? [[sha256, name]] : []))];
  const hashes = view.record ? Object.entries(view.record.hashes).map(([name, hash]) => [hash, name]) : known;
  if (!hashes.length) return "";
  return `<details class="model-verify"><summary>${t("models.meta.checksum")}</summary><code>${hashes.map(([hash, name]) => `${escapeHtml(hash)}  ${escapeHtml(name)}`).join("\n")}</code></details>`;
}

function renderProgress(view: ModelView, shownPercent?: number): string {
  if (!BUSY_STATUSES.includes(view.status)) return "";
  const percent = percentOf(view);
  const shown = shownPercent ?? percent;
  const verifying = view.status === "verifying";
  return `
    <div class="model-card__progress">
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
  const install = (label: TranslationKey): string => (isDownloadable(view.manifest) ? pill("install", label, true) : renderPackageDownload(view, "models.action.download", true));
  switch (view.status) {
    case "absent": return install(view.staged.length ? "models.action.downloadMissing" : "models.action.install") + discard;
    case "failed": return install("models.action.retry") + discard;
    case "downloading": return pill("pause", "models.action.pause") + pill("cancel", "models.action.cancel");
    case "paused": return install("models.action.resume") + pill("cancel", "models.action.cancel");
    case "installed": return (view.updateAvailable && !view.manifest.deprecated ? install("models.action.update") : "") + pill(view.record?.enabled ? "disable" : "enable", view.record?.enabled ? "models.action.disable" : "models.action.enable") + pill("remove", "models.action.remove") + discard;
    case "unsupported": return view.record ? pill("remove", "models.action.remove") : "";
    default: return "";
  }
}

function renderPackageDownload(view: ModelView, label: TranslationKey, accent = false): string {
  const archive = view.manifest.package;
  return archive ? `<a class="action-pill${accent ? " action-pill--accent" : ""}" href="${escapeHtml(archive.url)}" target="_blank" rel="noopener" data-action="download" download>${t(label)}</a>` : "";
}

function renderImport(view: ModelView): string {
  const blocked = BUSY_STATUSES.includes(view.status) || view.status === "unsupported";
  const exportButton = view.status === "installed" ? `<button type="button" class="action-pill" data-action="export">${t("models.action.export")}</button>` : "";
  const packageLink = isDownloadable(view.manifest) ? renderPackageDownload(view, "models.action.downloadPackage") : "";
  const importButton = blocked ? "" : `<button type="button" class="action-pill" data-action="import">${t("models.action.importFile")}</button><input type="file" accept=".zip,.onnx,.json,.txt" multiple hidden data-import-input />`;
  const actions = exportButton + packageLink + importButton;
  return actions ? `<div class="model-source__actions">${actions}</div>` : "";
}

export function renderModelCard(view: ModelView, expanded: boolean, shownPercent?: number, undoSeconds: number | null = null): string {
  const { manifest } = view;
  const modifier = BADGE_MODIFIER[view.status];
  const name = escapeHtml(manifest.name);
  const detailsId = `model-details-${manifest.id}`;
  const actions = renderActions(view, undoSeconds);
  return `
    <article class="model-card${expanded ? " model-card--expanded" : ""}${undoSeconds !== null ? " model-card--pending-delete" : ""}" id="${escapeHtml(modelAnchor(manifest))}" data-model="${escapeHtml(manifest.id)}" data-status="${view.status}">
      <header class="model-card__header">
        <h3 class="model-card__name"><button type="button" class="model-card__toggle" data-action="toggle" aria-expanded="${expanded}" aria-controls="${detailsId}" title="${name}">${name}</button></h3>
        <span class="tag model-card__kind">${t(MODEL_KINDS[manifest.kind].labelKey)}</span>
        <span class="status-badge${modifier ? ` status-badge--${modifier}` : ""}" data-status-label>${escapeHtml(statusLabel(view))}</span>
        <span class="model-card__chevron${expanded ? " model-card__chevron--open" : ""}" aria-hidden="true">${CHEVRON_DOWN_ICON}</span>
      </header>
      <p class="model-card__description">${escapeHtml(modelDescription(manifest))}</p>
      <div class="model-card__summary">
        <ul class="model-card__chips">${renderChips(view)}</ul>
        ${actions ? `<div class="model-card__actions">${actions}</div>` : ""}
      </div>
      ${renderProgress(view, shownPercent)}
      <div class="model-card__details" id="${detailsId}"${expanded ? "" : " hidden"}>
        ${renderStatusNotes(view)}
        ${renderMeta(view)}
        ${renderChecksums(view)}
      </div>
    </article>`;
}
