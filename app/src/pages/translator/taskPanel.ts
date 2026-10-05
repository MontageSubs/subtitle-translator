import { t } from "../../i18n";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { trackAssistEdits } from "../../lib/unsavedChanges";
import { renderDirectionArrow } from "../../render/icons";
import { escapeHtml } from "../../utils/escapeHtml";
import { fileCountLabel, taskHeaderLabel } from "./state";
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

  function renderFailure(failure: TaskFailure = {}): void {
    const message = failure.errorText;
    errorText.textContent = !message || NETWORK_ERROR_PATTERN.test(message) ? t("error.networkError") : message;
    const completed = failure.completedCount ?? state.files.filter((file) => file.jobResult).length;
    const total = failure.totalCount ?? state.files.length;
    failedCues.textContent = `${completed.toLocaleString()} / ${total.toLocaleString()}`;
    failedElapsed.textContent = formatSeconds(failure.elapsedMs || ctx.progress.elapsedMs());
  }

  function setState(mode: TaskMode, failure?: TaskFailure): void {
    statusBadge.className = `task-card__status-badge task-card__status-badge--${mode === "processing" ? "translating" : mode}`;
    const badgeKey = mode === "ready" ? "task.status.ready" : mode === "processing" ? "task.status.translating" : null;
    statusBadge.hidden = badgeKey === null;
    if (badgeKey) statusText.textContent = t(badgeKey);

    (Object.keys(views) as TaskMode[]).forEach((key) => { views[key].hidden = key !== mode; });
    if (mode === "failed") renderFailure(failure);
    ctx.log.setError(mode === "failed");
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
    const { source, target } = ctx.language.directionLabels();
    const sourceLabel = ctx.language.sourceCode() === AUTO_DETECT_CODE ? t("lang.autoDetect") : source;
    direction.innerHTML = `<span>${escapeHtml(sourceLabel)}</span> ${renderDirectionArrow(12)} <strong>${escapeHtml(target)}</strong>`;
    configTags.innerHTML = configTagMarkup();

    const validCueCount = state.files.reduce((sum, file) => sum + (file.parseError ? 0 : file.cues.length), 0);
    const hasParseErrors = state.files.some((file) => file.parseError) || state.rejectedArchives.length > 0;
    startButton.disabled = validCueCount === 0 || hasParseErrors;

    trackAssistEdits(state.contextText, state.glossaryEntries.length);
  }

  configPill.addEventListener("click", () => {
    ctx.query<HTMLElement>("#lang-step").scrollIntoView({ behavior: "smooth", block: "start" });
    ctx.query<HTMLElement>("#source-lang").focus();
  }, { signal: ctx.signal });

  return { setState, updateHeader };
}
