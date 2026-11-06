import { LOCALE_OPTION_SELECTOR } from "../../components/localeMenu";
import { getLocale, isLocaleCode } from "../../i18n";
import { supportsPunctuationStyle } from "../../lib/subtitle/postprocess/punctuationStyle";
import { scopedQuery } from "../../utils/dom";
import { renderWorkspace } from "../../render/translator/workspace";
import { TRANSLATOR_WORKSPACE_ID } from "../../render/translator/intro";
import { mountLogPanel } from "../../components/logPanel";
import { markAssistEditsPreserved, setTranslationCompletedNotDownloaded, trackAssistEdits } from "../../lib/unsavedChanges";
import { assistTotals } from "./assistScope";
import { createWorkspaceState, taskHeaderLabel } from "./state";
import { hydrateFromHistory, hydrateFromLocaleSwitch, saveLocaleSwitchDraft } from "./drafts";
import { mountSettingSummaries } from "./settingSummaries";
import { mountTaskPanel } from "./taskPanel";
import { mountRunProgress } from "./runProgress";
import { mountAssistFields } from "./assistFields";
import { mountOutputOptions } from "./outputOptions";
import { mountLanguageStep } from "./languageStep";
import { mountTermRecognition } from "./termRecognition";
import { mountFileQueue } from "./fileQueue";
import { mountResultPanel } from "./resultPanel";
import { mountTranslationRun } from "./translationRun";
import { mountStats } from "./stats";
import { mountAccessGate } from "./accessGate";
import { mountHistoryGate } from "./historyGate";
import { createWorkspaceFlow } from "./workspaceFlow";
import { hasQueuedInput, hasUsableFiles } from "./fileValidation";
import type { WorkspaceContext } from "./context";

const state = createWorkspaceState();
let lifecycle: AbortController | null = null;

function ensureWorkspaceHost(container: HTMLElement): HTMLElement {
  let host = container.querySelector<HTMLElement>(`#${TRANSLATOR_WORKSPACE_ID}`);
  if (!host) {
    host = document.createElement("div");
    host.id = TRANSLATOR_WORKSPACE_ID;
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
  const liveRegion = scopedQuery(host)<HTMLElement>("#workspace-live");
  ctx.announce = (message) => { liveRegion.textContent = message; };
  ctx.flow = createWorkspaceFlow(ctx);
  ctx.log = mountLogPanel(host);
  ctx.summaries = mountSettingSummaries(ctx);
  ctx.task = mountTaskPanel(ctx);
  ctx.progress = mountRunProgress(ctx);
  ctx.assist = mountAssistFields(ctx);
  ctx.output = mountOutputOptions(ctx);
  ctx.language = mountLanguageStep(ctx);
  ctx.recognition = mountTermRecognition(ctx);
  ctx.files = mountFileQueue(ctx);
  ctx.result = mountResultPanel(ctx);
  mountStats(ctx);
  mountTranslationRun(ctx);
  return ctx;
}

function restoreSession(ctx: WorkspaceContext): void {
  ctx.files.render();
  ctx.assist.syncFiles();
  if (!hasUsableFiles(state)) return;
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
    workspaceVisible: hasUsableFiles(state),
    hasQueue: hasQueuedInput(state),
    headerLabel: taskHeaderLabel(state.files),
    caseSensitiveTerms: state.caseSensitiveTerms,
    perSubtitle: state.assistPerSubtitle,
    sceneSeconds: state.sceneSeconds,
    contextLength: state.contextText.trim().length,
    sdhEnabled: state.sdhEnabled,
    musicTopAlign: state.musicTopAlign,
    skipLyrics: state.skipLyrics,
    fullWidthPunctuation: state.fullWidthPunctuation,
    keepTerminalPunctuation: state.keepTerminalPunctuation,
    punctuationVisible: supportsPunctuationStyle(state.targetLang),
    creditEnabled: state.creditEnabled,
    assCustomPrimarySize: state.assCustomPrimarySize,
    assCustomSecondarySize: state.assCustomSecondarySize,
  });
  const ctx = createContext(host, lifecycle.signal);
  ctx.assist.syncSdh(ctx.language.sourceCode());
  document.addEventListener("click", (event) => {
    const option = (event.target as HTMLElement).closest<HTMLAnchorElement>(LOCALE_OPTION_SELECTOR);
    if (!option || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (isLocaleCode(option.hreflang) && saveLocaleSwitchDraft(state, option.hreflang)) markAssistEditsPreserved();
  }, { signal: lifecycle.signal });
  restoreSession(ctx);
  mountAccessGate(container, lifecycle.signal);
  ctx.historyGate = mountHistoryGate(container, lifecycle.signal);
}

function syncUnsavedAssistEdits(): void {
  const { hasContext, glossaryCount } = assistTotals(state);
  trackAssistEdits(hasContext, glossaryCount);
}

function renderRestoredHistory(container: HTMLElement): void {
  syncUnsavedAssistEdits();
  renderWorkspaceInto(container);
  setTranslationCompletedNotDownloaded(false);
}

export function mount(container: HTMLElement): void {
  if (hydrateFromHistory(state)) {
    renderRestoredHistory(container);
    return;
  }
  hydrateFromLocaleSwitch(state);
  syncUnsavedAssistEdits();
  renderWorkspaceInto(container);
}

export function onRouteRevisit(container: HTMLElement): void {
  if (hydrateFromHistory(state)) renderRestoredHistory(container);
}
