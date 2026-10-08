import { getLocale } from "../../i18n";
import { scopedQuery } from "../../utils/dom";
import { renderWorkspace } from "../../render/translator/workspace";
import { mountLogPanel } from "../../components/logPanel";
import { updateCaptchaScrollLock } from "../../api/translation";
import { trackAssistEdits } from "../../lib/unsavedChanges";
import { createWorkspaceState, taskHeaderLabel } from "./state";
import { hydrateFromHistory, hydrateFromLocaleSwitch, saveLocaleSwitchDraft } from "./drafts";
import { mountTaskPanel } from "./taskPanel";
import { mountRunProgress } from "./runProgress";
import { mountAssistFields } from "./assistFields";
import { mountOutputOptions } from "./outputOptions";
import { mountLanguageStep } from "./languageStep";
import { mountFileQueue } from "./fileQueue";
import { mountResultPanel } from "./resultPanel";
import { mountTranslationRun } from "./translationRun";
import { mountStats } from "./stats";
import { createWorkspaceFlow } from "./workspaceFlow";
import type { WorkspaceContext } from "./context";

const state = createWorkspaceState();
const WORKSPACE_ID = "translator-workspace";
let lifecycle: AbortController | null = null;

function ensureWorkspaceHost(container: HTMLElement): HTMLElement {
  let host = container.querySelector<HTMLElement>(`#${WORKSPACE_ID}`);
  if (!host) {
    host = document.createElement("div");
    host.id = WORKSPACE_ID;
    container.appendChild(host);
  }
  return host;
}

function createContext(host: HTMLElement, signal: AbortSignal): WorkspaceContext {
  const ctx = {
    root: host,
    signal,
    state,
    query: scopedQuery(host),
  } as WorkspaceContext;
  ctx.flow = createWorkspaceFlow(ctx);
  ctx.log = mountLogPanel(host);
  ctx.task = mountTaskPanel(ctx);
  ctx.progress = mountRunProgress(ctx);
  ctx.assist = mountAssistFields(ctx);
  ctx.output = mountOutputOptions(ctx);
  ctx.language = mountLanguageStep(ctx);
  ctx.files = mountFileQueue(ctx);
  ctx.result = mountResultPanel(ctx);
  ctx.stats = mountStats(ctx);
  mountTranslationRun(ctx);
  return ctx;
}

function restoreSession(ctx: WorkspaceContext): void {
  ctx.files.render();
  if (!state.files.length) return;
  ctx.files.setWorkspaceVisible(true);
  ctx.flow.languageDetected();
  if (state.files.some((file) => file.jobResult)) void ctx.result.present();
  else ctx.task.setState("ready");
}

function renderWorkspaceInto(container: HTMLElement): void {
  lifecycle?.abort();
  lifecycle = new AbortController();
  const host = ensureWorkspaceHost(container);
  host.innerHTML = renderWorkspace({
    locale: getLocale(),
    hasFiles: state.files.length > 0,
    headerLabel: taskHeaderLabel(state.files),
    caseSensitiveTerms: state.caseSensitiveTerms,
    sceneSeconds: state.sceneSeconds,
    contextLength: state.contextText.trim().length,
    sdhEnabled: state.sdhEnabled,
    musicTopAlign: state.musicTopAlign,
    cueLayoutSplit: state.cueLayout === "split",
    assCustomPrimarySize: state.assCustomPrimarySize,
    assCustomSecondarySize: state.assCustomSecondarySize,
    assEqualBilingualSize: state.assEqualBilingualSize,
  });
  const ctx = createContext(host, lifecycle.signal);
  document.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest(".locale-menu__option")) saveLocaleSwitchDraft(state);
  }, { signal: lifecycle.signal });
  restoreSession(ctx);
  updateCaptchaScrollLock();
}

function syncUnsavedAssistEdits(): void {
  trackAssistEdits(state.contextText, state.glossaryEntries.length);
}

export function mount(container: HTMLElement): void {
  if (!hydrateFromHistory(state)) hydrateFromLocaleSwitch(state);
  syncUnsavedAssistEdits();
  renderWorkspaceInto(container);
}

export function onRouteRevisit(container: HTMLElement): void {
  if (!hydrateFromHistory(state)) return;
  syncUnsavedAssistEdits();
  renderWorkspaceInto(container);
}
