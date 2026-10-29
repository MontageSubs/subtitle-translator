import { setPageMeta } from "../../config/head";
import { getLocale, t } from "../../i18n";
import { clearPendingRecognition, pendingRecognitionModel } from "../../lib/entities/pendingRecognition";
import { DELETION_UNDO_WINDOW_MS, cancelDeletion, deletionRemainingMs, isDeletionQueued, queueDeletion, subscribeDeletionSettled } from "../../lib/history/deletionQueue";
import { showToastMessage } from "../../components/updateToast";
import { findModel, findModelByAnchor, modelAnchor } from "../../lib/models/catalog";
import { MODEL_KINDS } from "../../lib/models/kinds";
import { filterModelViews } from "../../lib/models/search";
import type { ModelView } from "../../lib/models/manager";
import type { ModelKind } from "../../lib/models/types";
import { cancelModelInstall, checkModelUpdates, discardStagedFiles, importModelFiles, installModel, isModelReady, listModelViews, modelView, pauseModelInstall, refreshModels, removeModel, setModelEnabled, subscribeModels, updateCheckState } from "../../lib/models/manager";
import { prepareModel, releaseModels } from "../../lib/models/runtime/hub";
import { CLOSE_ICON } from "../../render/icons";
import { HOME_PAGE_ID } from "../../render/paths";
import { buildPath, navigate } from "../../router/router";
import { isRightToLeft, nextTabIndex, syncTabButtons } from "../../components/tabList";
import { scopedQuery } from "../../utils/dom";
import { labelAttrs } from "../../utils/labelAttrs";
import { createSmoothProgress, type SmoothProgress } from "../../utils/smoothProgress";
import { failureMessage, progressDetail, renderModelCard, stagedMessage, statusLabel } from "./modelCard";

const RETURN_DELAY_MS = 600;
const PENDING_TOAST_MS = 6000;
const STAGING_TOAST_MS = 7000;

const renderPage = (): string => {
  const searchLabel = t("models.search.placeholder");
  return `
  <section class="step">
    <div class="history-page-header">
      <h1 class="history-page-title">${t("nav.models")}</h1>
      <div class="history-action-group"><button type="button" class="action-pill" id="models-check-updates">${t("models.updates.check")}</button></div>
    </div>
    <p class="history-page-subtitle">${t("models.subtitle")}</p>
    <div class="search-row">
      <div class="history-search-wrap">
        <input type="search" id="models-search-input" class="history-search-input" role="searchbox" placeholder="${searchLabel}" aria-label="${searchLabel}" />
        <button type="button" class="preview-search-clear icon-btn" id="models-search-clear" ${labelAttrs(t("preview.clearSearch"))} hidden>${CLOSE_ICON}</button>
      </div>
    </div>
    <div class="tab-strip" id="models-tabs" role="tablist" aria-label="${t("models.tabs.label")}" hidden></div>
    <div id="models-list" role="tabpanel"></div>
  </section>`;
};

const UNDO_TICK_MS = 250;
const kindTabId = (kind: ModelKind): string => `models-tab-${kind}`;
const kindPanelId = "models-list";
const isModelKind = (value: string | null): value is ModelKind => value !== null && Object.keys(MODEL_KINDS).includes(value);
const removalKey = (id: string): string => `models:${id}`;
const undoSecondsOf = (id: string): number | null => (isDeletionQueued(removalKey(id)) ? Math.max(1, Math.ceil(deletionRemainingMs(removalKey(id)) / 1000)) : null);

export function mount(container: HTMLElement, signal: AbortSignal): void {
  setPageMeta(t("nav.models"), t("meta.models.description"));
  container.innerHTML = renderPage();
  const query = scopedQuery(container);
  const list = query<HTMLElement>("#models-list");
  const tabs = query<HTMLElement>("#models-tabs");
  const searchInput = query<HTMLInputElement>("#models-search-input");
  const searchClear = query<HTMLButtonElement>("#models-search-clear");
  const checkButton = query<HTMLButtonElement>("#models-check-updates");
  const smoothers = new Map<string, SmoothProgress>();
  const expanded = new Set<string>();
  let rendered = "";
  let frame = 0;
  let returning = false;
  let undoTicker: number | undefined;
  let announcedPhase = updateCheckState().phase;
  let activeKind: ModelKind | null = null;
  let searchText = "";
  let renderedKinds = "";
  const announcedFailures = new Map<string, string>();
  const announcedStaging = new Map<string, string>();
  if (pendingRecognitionModel() !== null) showToastMessage(t("models.pending.banner"), PENDING_TOAST_MS);

  const layoutKey = (): string => listModelViews().map((view) => `${view.manifest.id}:${view.status}:${view.record?.enabled}:${view.updateAvailable}:${view.failure}:${view.staged.join("+")}:${updateCheckState().phase}:${view.record?.installedAt}:${expanded.has(view.manifest.id)}:${activeKind}:${searchText}:${isDeletionQueued(removalKey(view.manifest.id))}`).join("|");

  const installable = (): ModelView[] => listModelViews().filter(({ manifest, record }) => !manifest.deprecated || record);

  const viewsOf = (kind: ModelKind): ModelView[] => filterModelViews(installable().filter(({ manifest }) => manifest.kind === kind), searchText);

  const modelKinds = (): ModelKind[] => (Object.keys(MODEL_KINDS) as ModelKind[]).filter((kind) => installable().some(({ manifest }) => manifest.kind === kind));

  function showKind(kind: ModelKind): void {
    activeKind = kind;
    renderList();
  }

  function renderTabs(kinds: readonly ModelKind[]): void {
    tabs.hidden = !kinds.length;
    if (kinds.join() !== renderedKinds) {
      renderedKinds = kinds.join();
      tabs.innerHTML = kinds.map((kind) => `<button type="button" class="tab-strip__tab" role="tab" id="${kindTabId(kind)}" aria-controls="${kindPanelId}" data-kind="${kind}">${t(MODEL_KINDS[kind].titleKey)}</button>`).join("");
    }
    syncTabButtons(tabs.querySelectorAll<HTMLElement>("[data-kind]"), (button) => button.dataset.kind === activeKind, "tab-strip__tab--active");
    if (activeKind) list.setAttribute("aria-labelledby", kindTabId(activeKind));
  }

  function renderGroup(kind: ModelKind): string {
    const rows = viewsOf(kind);
    const cards = rows.length
      ? rows.map((view) => renderModelCard(view, expanded.has(view.manifest.id), smoothers.has(view.manifest.id) ? Math.floor(smoothers.get(view.manifest.id)!.value() * 100) : undefined, undoSecondsOf(view.manifest.id))).join("")
      : `<p class="history-empty">${t("models.search.empty")}</p>`;
    return `
      <section class="hub-group">
        <p class="hub-group__desc">${t(MODEL_KINDS[kind].descriptionKey)}</p>
        <div class="hub-group__cards">${cards}</div>
      </section>`;
  }

  function renderList(): void {
    const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
    const selector = focused ? `[data-model="${focused.closest<HTMLElement>("[data-model]")?.dataset.model}"] [data-action="${focused.dataset.action ?? focused.closest<HTMLElement>("[data-action]")?.dataset.action}"]` : null;
    const kinds = modelKinds();
    if (!activeKind || !kinds.includes(activeKind)) activeKind = kinds[0] ?? null;
    if (activeKind && searchText.trim() && !viewsOf(activeKind).length) activeKind = kinds.find((kind) => viewsOf(kind).length) ?? activeKind;
    renderTabs(kinds);
    list.innerHTML = activeKind ? renderGroup(activeKind) : "";
    keepUndoTicking();
    rendered = layoutKey();
    if (selector) list.querySelector<HTMLElement>(selector)?.focus();
  }

  function smootherFor(id: string): SmoothProgress {
    const existing = smoothers.get(id);
    if (existing) return existing;
    const created = createSmoothProgress((fraction) => {
      const percent = Math.min(100, Math.floor(fraction * 100));
      const row = list.querySelector<HTMLElement>(`[data-model="${id}"]`);
      row?.querySelector<HTMLElement>("[data-progress-fill]")?.style.setProperty("width", `${(fraction * 100).toFixed(2)}%`);
      row?.querySelector("[role=progressbar]")?.setAttribute("aria-valuenow", String(percent));
    });
    smoothers.set(id, created);
    return created;
  }

  function patchProgress(): void {
    list.querySelectorAll<HTMLElement>("[data-model]").forEach((row) => {
      const id = row.dataset.model!;
      const view = modelView(id);
      row.querySelector("[data-status-label]")!.textContent = statusLabel(view);
      if (view.status === "downloading") {
        smootherFor(id).set(view.total ? view.loaded / view.total : 0);
        row.querySelector("[data-progress-detail]")!.textContent = progressDetail(view);
      } else if (view.status === "paused") {
        smoothers.get(id)?.stop();
      } else if (smoothers.has(id)) {
        smoothers.get(id)!.stop();
        smoothers.delete(id);
      }
    });
  }

  function keepUndoTicking(): void {
    if (undoTicker !== undefined || !listModelViews().some((view) => isDeletionQueued(removalKey(view.manifest.id)))) return;
    undoTicker = window.setInterval(() => {
      list.querySelectorAll<HTMLElement>("[data-model]").forEach((row) => {
        const seconds = undoSecondsOf(row.dataset.model!);
        const label = row.querySelector("[data-undo-label]");
        if (seconds !== null && label) label.textContent = t("common.undoCountdown", { seconds });
      });
      if (!listModelViews().some((view) => isDeletionQueued(removalKey(view.manifest.id)))) {
        window.clearInterval(undoTicker);
        undoTicker = undefined;
      }
    }, UNDO_TICK_MS);
  }

  function announceModelStates(): void {
    for (const view of listModelViews()) {
      const failure = view.status === "failed" ? failureMessage(view) : null;
      if (failure && announcedFailures.get(view.manifest.id) !== failure) showToastMessage(failure);
      if (failure) announcedFailures.set(view.manifest.id, failure);
      else announcedFailures.delete(view.manifest.id);
      const staging = view.staged.length ? stagedMessage(view) : null;
      if (staging && announcedStaging.get(view.manifest.id) !== staging) showToastMessage(staging, STAGING_TOAST_MS);
      if (staging) announcedStaging.set(view.manifest.id, staging);
      else announcedStaging.delete(view.manifest.id);
    }
  }

  function announceUpdateCheck(): void {
    const { phase, available } = updateCheckState();
    checkButton.disabled = phase === "checking";
    if (phase === announcedPhase) return;
    announcedPhase = phase;
    if (phase === "checking") showToastMessage(t("models.updates.checking"));
    else if (phase === "failed") showToastMessage(t("models.updates.failed"));
    else if (phase === "done") showToastMessage(t(available ? "models.updates.available" : "models.updates.none", { count: available }));
  }

  function revealFromHash(): void {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (isModelKind(hash)) return showKind(hash);
    const target = findModelByAnchor(hash);
    if (!target) return;
    activeKind = target.kind;
    expanded.add(target.id);
    renderList();
    list.querySelector(`[data-model="${target.id}"]`)?.scrollIntoView({ block: "start" });
  }

  async function resumePendingRecognition(): Promise<void> {
    const modelId = pendingRecognitionModel();
    const manifest = modelId ? findModel(modelId) : undefined;
    if (!manifest || returning || !isModelReady(manifest.id)) return;
    returning = true;
    try {
      await prepareModel(manifest);
    } catch {
      returning = false;
      clearPendingRecognition();
      return;
    }
    window.setTimeout(() => {
      if (!signal.aborted) navigate(buildPath(getLocale(), HOME_PAGE_ID));
    }, RETURN_DELAY_MS);
  }

  function sync(): void {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      announceUpdateCheck();
      announceModelStates();
      if (layoutKey() === rendered) patchProgress();
      else renderList();
      void resumePendingRecognition();
    });
  }

  function toggleCard(id: string): void {
    if (expanded.delete(id)) {
      if (location.hash === `#${modelAnchor(findModel(id)!)}`) history.replaceState(null, "", `#${findModel(id)!.kind}`);
    } else {
      expanded.add(id);
      history.replaceState(null, "", `#${modelAnchor(findModel(id)!)}`);
    }
    renderList();
  }

  function isCardSurfaceClick(card: HTMLElement, target: HTMLElement): boolean {
    if (target.closest("a, button, input, label, summary, details")) return false;
    if (window.getSelection()?.toString()) return false;
    return !card.classList.contains("hub-card--expanded") || target.closest(".hub-card__header") !== null;
  }

  list.addEventListener("click", (event) => {
    const clicked = event.target as HTMLElement;
    const card = clicked.closest<HTMLElement>("[data-model]");
    const id = card?.dataset.model;
    if (!card || !id) return;
    const target = clicked.closest<HTMLElement>("[data-action]");
    if (!target) {
      if (isCardSurfaceClick(card, clicked)) toggleCard(id);
      return;
    }
    switch (target.dataset.action) {
      case "install": void installModel(id); break;
      case "pause": pauseModelInstall(id); break;
      case "cancel": cancelModelInstall(id); clearPendingRecognition(); break;
      case "discard": discardStagedFiles(id); break;
      case "enable": setModelEnabled(id, true); break;
      case "disable": setModelEnabled(id, false); releaseModels(findModel(id)!.kind); break;
      case "remove":
        if (!cancelDeletion(removalKey(id))) queueDeletion(removalKey(id), DELETION_UNDO_WINDOW_MS, async () => {
          releaseModels(findModel(id)!.kind);
          await removeModel(id);
        });
        renderList();
        break;
      case "import": target.parentElement?.querySelector<HTMLInputElement>("[data-import-input]")?.click(); break;
      case "toggle": toggleCard(id); break;
    }
  }, { signal });

  subscribeDeletionSettled(sync, signal);
  window.addEventListener("hashchange", revealFromHash, { signal });

  tabs.addEventListener("click", (event) => {
    const kind = (event.target as HTMLElement).closest<HTMLElement>("[data-kind]")?.dataset.kind ?? null;
    if (!isModelKind(kind) || kind === activeKind) return;
    history.replaceState(null, "", `#${kind}`);
    showKind(kind);
  }, { signal });

  tabs.addEventListener("keydown", (event) => {
    const buttons = [...tabs.querySelectorAll<HTMLElement>('[role="tab"]')];
    const current = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    const next = current ? nextTabIndex(event.key, buttons.indexOf(current), buttons.length, isRightToLeft(current)) : null;
    if (next === null) return;
    event.preventDefault();
    buttons[next].focus();
    buttons[next].click();
  }, { signal });

  function syncSearch(): void {
    searchText = searchInput.value;
    searchClear.hidden = searchText.length === 0;
    renderList();
  }

  searchInput.addEventListener("input", (event) => {
    if (!(event as InputEvent).isComposing) syncSearch();
  }, { signal });
  searchInput.addEventListener("compositionend", syncSearch, { signal });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    syncSearch();
    searchInput.focus();
  }, { signal });

  checkButton.addEventListener("click", () => void checkModelUpdates(), { signal });

  list.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const id = input.closest<HTMLElement>("[data-model]")?.dataset.model;
    const files = Array.from(input.files ?? []);
    if (id && files.length && input.matches("[data-import-input]")) void importModelFiles(id, files);
    input.value = "";
  }, { signal });

  const unsubscribe = subscribeModels(sync);
  signal.addEventListener("abort", () => {
    cancelAnimationFrame(frame);
    smoothers.forEach((smoother) => smoother.stop());
    window.clearInterval(undoTicker);
    unsubscribe();
  }, { once: true });
  void refreshModels().then(() => {
    if (signal.aborted) return;
    sync();
    revealFromHash();
  });
}
