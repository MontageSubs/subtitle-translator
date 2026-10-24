import { t, TranslationKey } from "../../i18n";
import { scrollToElement } from "../../utils/dom";
import { trackAssistEdits } from "../../lib/unsavedChanges";
import { renderDirectionArrow } from "../../render/icons";
import { escapeHtml } from "../../utils/escapeHtml";
import { fileCountLabel, taskHeaderLabel } from "./state";
import { submissionBlocker } from "./fileValidation";
import type { WorkspaceContext } from "./context";

export type TaskMode = "ready" | "processing" | "completed" | "failed";

export interface TaskFailure {
  errorText?: string;
  elapsedMs?: number;
  completedCount?: number;
  totalCount?: number;
}

export interface TaskPanelHandle {
  setState(mode: TaskMode, failure?: TaskFailure): void;
  updateHeader(): void;
}

const ANNOUNCEMENT_KEYS: Partial<Record<TaskMode, TranslationKey>> = {
  processing: "task.status.translating",
  completed: "task.status.done",
  failed: "task.status.failed",
};

const STATUS_BADGES: Partial<Record<TaskMode, { variant: string; key: TranslationKey }>> = {
  ready: { variant: "ready", key: "task.status.ready" },
  processing: { variant: "translating", key: "task.status.translating" },
};

const FOCUS_TARGET_SELECTORS: Record<TaskMode, string> = {
  ready: "#start",
  processing: "#task-stop-btn",
  completed: "#download-link",
  failed: "#task-retry-btn",
};

const NETWORK_ERROR_PATTERN = /fetch|network|failed to fetch/i;

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function mountTaskPanel(ctx: WorkspaceContext): TaskPanelHandle {
  const { state } = ctx;
  const filename = ctx.query<HTMLElement>("#task-filename");
  const cueCount = ctx.query<HTMLElement>("#task-cue-count");
  const configPill = ctx.query<HTMLButtonElement>("#task-config-pill");
  const direction = ctx.query<HTMLElement>("#task-direction");
  const configTags = ctx.query<HTMLElement>("#task-config-tags");
  const statusBadge = ctx.query<HTMLElement>("#task-status-badge");
  const statusText = ctx.query<HTMLElement>("#task-status-text");
  const startButton = ctx.query<HTMLButtonElement>("#start");
  const failedCues = ctx.query<HTMLElement>("#task-failed-cues");
  const failedElapsed = ctx.query<HTMLElement>("#task-failed-elapsed");
  const errorText = ctx.query<HTMLElement>("#task-error-text");
  const views: Record<TaskMode, HTMLElement> = {
    ready: ctx.query("#task-view-ready"),
    processing: ctx.query("#task-view-processing"),
    completed: ctx.query("#task-view-completed"),
    failed: ctx.query("#task-view-failed"),
  };

  const insideViews = (node: EventTarget | null): boolean => Object.values(views).some((view) => view.contains(node as Node));
  let focusInViews = false;
  const trackFocus = (event: Event): void => { focusInViews = insideViews(event.target); };
  document.addEventListener("focusin", trackFocus, { signal: ctx.signal });
  document.addEventListener("pointerdown", trackFocus, { signal: ctx.signal });

  function renderFailure(failure: TaskFailure = {}): void {
    const message = failure.errorText;
    errorText.textContent = !message || NETWORK_ERROR_PATTERN.test(message) ? t("error.networkError") : message;
    const completed = failure.completedCount ?? state.files.filter((file) => file.jobResult).length;
    const total = failure.totalCount ?? state.files.length;
    failedCues.textContent = `${completed.toLocaleString()} / ${total.toLocaleString()}`;
    failedElapsed.textContent = formatSeconds(failure.elapsedMs || ctx.progress.elapsedMs());
  }

  function setState(mode: TaskMode, failure?: TaskFailure): void {
    const restoreFocus = focusInViews && (insideViews(document.activeElement) || document.activeElement === document.body);
    const badge = STATUS_BADGES[mode];
    statusBadge.hidden = !badge;
    if (badge) {
      statusBadge.className = `task-card__status-badge task-card__status-badge--${badge.variant}`;
      statusText.textContent = t(badge.key);
    }
    const announcementKey = ANNOUNCEMENT_KEYS[mode];
    if (announcementKey) ctx.announce(t(announcementKey));

    (Object.keys(views) as TaskMode[]).forEach((key) => { views[key].hidden = key !== mode; });
    if (mode === "failed") renderFailure(failure);
    ctx.log.setError(mode === "failed");
    if (restoreFocus) ctx.query<HTMLElement>(FOCUS_TARGET_SELECTORS[mode]).focus({ preventScroll: true });
  }

  function configTagMarkup(): string {
    const tags: string[] = [];
    const glossaryCount = ctx.assist.glossary.getEntries().length;
    if (glossaryCount > 0) tags.push(t("task.tag.glossaryCount", { count: glossaryCount }));
    if (state.contextText.trim().length > 0) tags.push(t("task.tag.context"));
    return tags.map((tag) => `<span class="task-card__tag">${tag}</span>`).join("");
  }

  function updateHeader(): void {
    filename.textContent = taskHeaderLabel(state.files);
    cueCount.textContent = state.files.length ? fileCountLabel(state.files.length) : "";
    const { source, sourceTitle, target } = ctx.language.directionLabels();
    direction.innerHTML = `<span${sourceTitle ? ` title="${escapeHtml(sourceTitle)}"` : ""}>${escapeHtml(source)}</span> ${renderDirectionArrow(12)} <strong>${escapeHtml(target)}</strong>`;
    configTags.innerHTML = configTagMarkup();

    startButton.disabled = state.files.length === 0 || submissionBlocker(state) !== null;

    ctx.summaries.refresh();
    trackAssistEdits(state.contextText, state.glossaryEntries.length);
  }

  configPill.addEventListener("click", () => {
    scrollToElement(ctx.query<HTMLElement>("#lang-step"));
    ctx.query<HTMLElement>("#source-lang-combo .lang-combo__trigger").focus({ preventScroll: true });
  }, { signal: ctx.signal });

  return { setState, updateHeader };
}
