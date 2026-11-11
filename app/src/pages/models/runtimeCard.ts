import { getLocale, t, type TranslationKey, th } from "../../i18n";
import { CHEVRON_DOWN_ICON, UNDO_ICON } from "../../render/icons";
import { escapeHtml } from "../../utils/escapeHtml";
import { PROVIDER_LABELS } from "../../lib/models/compatibility";
import { RUNTIME_VERSION } from "../../lib/models/runtime/ortAssets";
import { MIN_VISIBLE_FRACTION } from "../../utils/smoothProgress";
import { formatMegabytes } from "../../utils/localeFormat";
import type { RuntimePhase, RuntimeView } from "../../lib/models/runtime/runtimeStore";

const BADGE_KEYS: Readonly<Record<RuntimePhase, TranslationKey>> = {
  checking: "models.runtime.status.checking",
  absent: "models.runtime.status.absent",
  installed: "models.runtime.status.installed",
  downloading: "models.runtime.status.downloading",
  paused: "models.status.paused",
  failed: "models.runtime.status.failed",
  unsupported: "models.status.unsupported",
};

const PERCENT_SCALE = 100;
export const RUNTIME_ANCHOR = "onnx-runtime-web";

const DETAILS_ID = "runtime-details";

export interface RuntimeCardState {
  removable: boolean;
  controllable: boolean;
  expanded: boolean;
  undoSeconds: number | null;
  shownFraction?: number;
}

export const runtimeCardKey = (view: RuntimeView, { removable, controllable, expanded, undoSeconds }: Omit<RuntimeCardState, "shownFraction">): string =>
  `${view.phase}:${view.incompatibility}:${view.usage?.bytes}:${view.downloadBytes}:${removable}:${controllable}:${expanded}:${undoSeconds !== null}`;

export function runtimeProgress(view: RuntimeView): { name: string; detail: string; fraction: number; waiting: boolean } {
  const { progress } = view;
  const locale = getLocale();
  if (!progress) return { name: "", detail: "", fraction: 0, waiting: true };
  return {
    name: progress.file,
    detail: t("models.progress.detail", { loaded: formatMegabytes(progress.loaded, locale), total: formatMegabytes(progress.total, locale) }),
    fraction: progress.total ? Math.min(1, progress.loaded / progress.total) : 0,
    waiting: progress.loaded === 0 && view.phase === "downloading",
  };
}

function renderActions(view: RuntimeView, { removable, controllable, undoSeconds }: RuntimeCardState): string {
  if (undoSeconds !== null) return `<button type="button" class="action-pill is-undoing" data-runtime-action="remove">${UNDO_ICON}<span data-undo-label>${th("common.undoCountdown", { seconds: undoSeconds })}</span></button>`;
  const pill = (action: string, label: TranslationKey, options: { accent?: boolean; disabled?: boolean } = {}): string =>
    `<button type="button" class="action-pill${options.accent ? " action-pill--accent" : ""}" data-runtime-action="${action}"${options.disabled ? " disabled" : ""}>${th(label)}</button>`;
  switch (view.phase) {
    case "absent": return pill("install", "models.action.install", { accent: true });
    case "failed": return pill("install", "models.action.retry", { accent: true });
    case "downloading": return controllable ? pill("pause", "models.action.pause") + pill("cancel", "models.action.cancel") : "";
    case "paused": return pill("install", "models.action.resume", { accent: true }) + pill("cancel", "models.action.cancel");
    case "installed": return pill("remove", "models.action.remove", { disabled: !removable });
    default: return "";
  }
}

function renderProgress(view: RuntimeView, shownFraction: number | undefined): string {
  if (view.phase !== "downloading" && view.phase !== "paused") return "";
  const { name, detail, fraction, waiting } = runtimeProgress(view);
  const shown = shownFraction ?? fraction;
  const indeterminate = waiting && shown < MIN_VISIBLE_FRACTION;
  return `
    <div class="model-card__progress">
      <div class="task-progress-head">
        <span class="task-processing-label" id="runtime-progress-label" data-runtime-name>${escapeHtml(name || t("models.runtime.name"))}</span>
        <span class="task-timer" data-runtime-detail>${escapeHtml(detail)}</span>
      </div>
      <div class="task-progress-container" role="progressbar" aria-labelledby="runtime-progress-label" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(fraction * PERCENT_SCALE)}">
        <div class="task-progress-fill${indeterminate ? " task-progress-fill--indeterminate" : ""}" data-runtime-fill style="--progress:${indeterminate ? 1 : shown.toFixed(4)}"></div>
      </div>
    </div>`;
}

const sizeBytesOf = ({ usage, downloadBytes }: RuntimeView): number => (usage?.installed ? usage.bytes : downloadBytes);

function renderChips(view: RuntimeView): string {
  const bytes = sizeBytesOf(view);
  const version = `<li class="model-chip">${escapeHtml(RUNTIME_VERSION)}</li>`;
  const size = bytes ? `<li class="model-chip">${escapeHtml(formatMegabytes(bytes, getLocale()))}</li>` : "";
  return version + size;
}

function renderUnsupportedNote(view: RuntimeView): string {
  if (view.phase !== "unsupported" || !view.incompatibility) return "";
  const reason = view.incompatibility === "cache" ? t("models.unsupported.cache") : t("models.unsupported.provider", { technology: PROVIDER_LABELS[view.incompatibility] });
  return `<div class="model-note"><h4 class="model-note__title">${th("models.runtime.unsupported.title")}</h4><p>${escapeHtml(reason)} ${escapeHtml(t("models.unsupported.hint"))}</p></div>`;
}

function renderNotes(view: RuntimeView, removable: boolean): string {
  const failure = view.phase === "failed" ? `<div class="model-note"><p>${th("models.runtime.failed")}</p></div>` : "";
  const locked = view.phase === "installed" && !removable ? `<div class="model-note"><p>${th("models.runtime.locked")}</p></div>` : "";
  return renderUnsupportedNote(view) + failure + locked;
}

function renderMeta(view: RuntimeView): string {
  const bytes = sizeBytesOf(view);
  const fields = [
    `<div><dt>${th("models.meta.version")}</dt><dd>${escapeHtml(RUNTIME_VERSION)}</dd></div>`,
    ...(bytes ? [`<div><dt>${th("models.meta.size")}</dt><dd>${escapeHtml(formatMegabytes(bytes, getLocale()))}</dd></div>`] : []),
  ].join("");
  return `<dl class="model-meta">${fields}</dl>`;
}

export function renderRuntimeCard(view: RuntimeView, state: RuntimeCardState): string {
  const { expanded, undoSeconds, removable } = state;
  const name = escapeHtml(t("models.runtime.name"));
  const inert = undoSeconds !== null ? " inert" : "";
  const actions = renderActions(view, state);
  const badgeModifier = view.phase === "installed" ? " status-badge--complete" : view.phase === "failed" || view.phase === "unsupported" ? " status-badge--incomplete" : "";
  return `
    <article class="model-card${expanded ? " model-card--expanded" : ""}${undoSeconds !== null ? " model-card--pending-delete" : ""}" id="${RUNTIME_ANCHOR}" data-runtime-card>
      <header class="model-card__header"${inert}>
        <h3 class="model-card__name"><button type="button" class="model-card__toggle" data-runtime-action="toggle" aria-expanded="${expanded}" aria-controls="${DETAILS_ID}" data-truncatable>${name}</button></h3>
        <span class="status-badge${badgeModifier}">${th(BADGE_KEYS[view.phase])}</span>
        <span class="model-card__chevron${expanded ? " model-card__chevron--open" : ""}" aria-hidden="true">${CHEVRON_DOWN_ICON}</span>
      </header>
      <p class="model-card__description"${inert}>${th("models.runtime.description")}</p>
      <div class="model-card__summary">
        <ul class="model-card__chips"${inert}>${renderChips(view)}</ul>
        ${actions ? `<div class="model-card__actions">${actions}</div>` : ""}
      </div>
      ${renderProgress(view, state.shownFraction)}
      <div class="model-card__details" id="${DETAILS_ID}"${expanded ? "" : " hidden"}${inert}>
        ${renderNotes(view, removable)}
        ${renderMeta(view)}
      </div>
    </article>`;
}

export function showRuntimeExpansion(card: HTMLElement, expanded: boolean): void {
  card.classList.toggle("model-card--expanded", expanded);
  card.querySelector("[data-runtime-action=\"toggle\"]")?.setAttribute("aria-expanded", String(expanded));
  card.querySelector(".model-card__chevron")?.classList.toggle("model-card__chevron--open", expanded);
  card.querySelector<HTMLElement>(".model-card__details")!.hidden = !expanded;
}

export function patchRuntimeProgress(root: ParentNode, view: RuntimeView, shownFraction: number): void {
  if (view.phase !== "downloading" && view.phase !== "paused") return;
  const { name, detail, waiting } = runtimeProgress(view);
  root.querySelector("[data-runtime-fill]")?.classList.toggle("task-progress-fill--indeterminate", waiting && shownFraction < MIN_VISIBLE_FRACTION);
  const label = root.querySelector("[data-runtime-name]");
  if (label && name && label.textContent !== name) label.textContent = name;
  const detailNode = root.querySelector("[data-runtime-detail]");
  if (detailNode && detailNode.textContent !== detail) detailNode.textContent = detail;
}
