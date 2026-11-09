import { getLocale, t, type TranslationKey } from "../../i18n";
import { UNDO_ICON } from "../../render/icons";
import { escapeHtml } from "../../utils/escapeHtml";
import { formatMegabytes } from "../../utils/localeFormat";
import type { RuntimePhase, RuntimeView } from "../../lib/models/runtime/runtimeStore";

const BADGE_KEYS: Readonly<Record<RuntimePhase, TranslationKey>> = {
  checking: "models.runtime.status.checking",
  absent: "models.runtime.status.absent",
  installed: "models.runtime.status.installed",
  downloading: "models.runtime.status.downloading",
  failed: "models.runtime.status.failed",
};

const PERCENT_SCALE = 100;

export const runtimeCardKey = (view: RuntimeView, removable: boolean, pendingRemoval: boolean): string => `${view.phase}:${view.usage?.version}:${view.usage?.bytes}:${removable}:${pendingRemoval}`;

export function runtimeProgress(view: RuntimeView): { name: string; detail: string; fraction: number; waiting: boolean } {
  const { progress } = view;
  const locale = getLocale();
  if (!progress) return { name: "", detail: "", fraction: 0, waiting: true };
  return {
    name: progress.file,
    detail: t("models.progress.detail", { loaded: formatMegabytes(progress.loaded, locale), total: formatMegabytes(progress.total, locale) }),
    fraction: progress.total ? Math.min(1, progress.loaded / progress.total) : 0,
    waiting: progress.loaded === 0,
  };
}

function renderActions(view: RuntimeView, removable: boolean, undoSeconds: number | null): string {
  if (undoSeconds !== null) return `<button type="button" class="action-pill is-undoing" data-runtime-action="remove">${UNDO_ICON}<span data-undo-label>${t("common.undoCountdown", { seconds: undoSeconds })}</span></button>`;
  const pill = (action: string, label: TranslationKey, options: { accent?: boolean; disabled?: boolean } = {}): string =>
    `<button type="button" class="action-pill${options.accent ? " action-pill--accent" : ""}" data-runtime-action="${action}"${options.disabled ? " disabled" : ""}>${t(label)}</button>`;
  switch (view.phase) {
    case "absent":
    case "failed": return pill("install", view.phase === "failed" ? "models.action.retry" : "models.action.install", { accent: true });
    case "installed": return pill("remove", "models.action.remove", { disabled: !removable });
    default: return "";
  }
}

function renderProgress(view: RuntimeView): string {
  if (view.phase !== "downloading") return "";
  const { name, detail, fraction, waiting } = runtimeProgress(view);
  return `
    <div class="model-card__progress">
      <div class="task-progress-head">
        <span class="task-processing-label" id="runtime-progress-label" data-runtime-name>${escapeHtml(name || t("models.runtime.name"))}</span>
        <span class="task-timer" data-runtime-detail>${escapeHtml(detail)}</span>
      </div>
      <div class="task-progress-container" role="progressbar" aria-labelledby="runtime-progress-label" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(fraction * PERCENT_SCALE)}">
        <div class="task-progress-fill${waiting ? " task-progress-fill--indeterminate" : ""}" data-runtime-fill style="--progress:${waiting ? 1 : fraction.toFixed(4)}"></div>
      </div>
    </div>`;
}

export function renderRuntimeCard(view: RuntimeView, removable: boolean, undoSeconds: number | null): string {
  const locale = getLocale();
  const { usage } = view;
  const fields = [
    `<div><dt>${t("models.meta.version")}</dt><dd>${escapeHtml(usage?.version ?? "—")}</dd></div>`,
    ...(usage?.installed ? [`<div><dt>${t("models.meta.size")}</dt><dd>${escapeHtml(formatMegabytes(usage.bytes, locale))}</dd></div>`] : []),
  ].join("");
  const note = view.phase === "installed" && !removable ? `<div class="model-note"><p>${t("models.runtime.locked")}</p></div>` : "";
  const failure = view.phase === "failed" ? `<div class="model-note"><p>${t("models.runtime.failed")}</p></div>` : "";
  return `
    <article class="model-card model-card--expanded${undoSeconds !== null ? " model-card--pending-delete" : ""}" id="runtime" data-runtime-card>
      <header class="model-card__header">
        <h3 class="model-card__name">${t("models.runtime.name")}</h3>
        <span class="status-badge${view.phase === "installed" ? " status-badge--complete" : view.phase === "failed" ? " status-badge--incomplete" : ""}">${t(BADGE_KEYS[view.phase])}</span>
      </header>
      <p class="model-card__description">${t("models.runtime.description")}</p>
      <div class="model-card__summary"><div class="model-card__actions">${renderActions(view, removable, undoSeconds)}</div></div>
      ${renderProgress(view)}
      ${failure}${note}
      <dl class="model-meta">${fields}</dl>
    </article>`;
}

export function patchRuntimeProgress(root: ParentNode, view: RuntimeView): void {
  if (view.phase !== "downloading") return;
  const { name, detail, fraction, waiting } = runtimeProgress(view);
  const fill = root.querySelector<HTMLElement>("[data-runtime-fill]");
  fill?.classList.toggle("task-progress-fill--indeterminate", waiting);
  if (!waiting) fill?.style.setProperty("--progress", fraction.toFixed(4));
  const label = root.querySelector("[data-runtime-name]");
  if (label && name && label.textContent !== name) label.textContent = name;
  const detailNode = root.querySelector("[data-runtime-detail]");
  if (detailNode && detailNode.textContent !== detail) detailNode.textContent = detail;
  root.querySelector("[role=progressbar]")?.setAttribute("aria-valuenow", String(Math.floor(fraction * PERCENT_SCALE)));
}
