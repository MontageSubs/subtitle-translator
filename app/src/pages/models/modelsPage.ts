import { applyPageMeta } from "../../config/head";
import { getLocale, t, type TranslationKey, th } from "../../i18n";
import { clearPendingRecognition, pendingRecognitionModel } from "../../lib/entities/pendingRecognition";
import { subscribeDeletionSettled } from "../../lib/history/deletionQueue";
import { showToastMessage } from "../../components/updateToast";
import { findModel, findModelByAnchor, modelAnchor } from "../../lib/models/catalog";
import { MODEL_KINDS } from "../../lib/models/kinds";
import { filterModelViews } from "../../lib/models/search";
import type { ModelView } from "../../lib/models/manager";
import type { ModelKind } from "../../lib/models/types";
import { cancelModelInstall, checkModelUpdates, discardStagedFiles, exportModelPackage, importModelFiles, installModel, isModelReady, isRemovalPending, listModelViews, modelView, pauseModelInstall, refreshModels, removalSecondsLeft, setModelEnabled, subscribeModels, toggleModelRemoval, updateCheckState } from "../../lib/models/manager";
import { prepareModel, releaseModels } from "../../lib/models/runtime/modelRuntime";
import { CLOSE_ICON } from "../../render/icons";
import { HOME_PAGE_ID } from "../../render/paths";
import { buildPath, navigate } from "../../router/router";
import { mountTabStrip, syncTabButtons } from "../../components/tabList";
import { scopedQuery } from "../../utils/dom";
import { saveBlob } from "../../utils/download";
import { labelAttrs } from "../../utils/labelAttrs";
import { createSmoothProgress, MIN_VISIBLE_FRACTION, type SmoothProgress } from "../../utils/smoothProgress";
import { cancelRuntime, installRuntime, isRuntimeControllable, isRuntimeRemovable, isRuntimeRemovalPending, pauseRuntime, refreshRuntime, runtimeRemovalSecondsLeft, runtimeView, subscribeRuntime, toggleRuntimeRemoval } from "../../lib/models/runtime/runtimeStore";
import { hasRuntimeAssets } from "../../lib/models/runtime/ortAssets";
import { patchRuntimeProgress, renderRuntimeCard, RUNTIME_ANCHOR, runtimeCardKey, runtimeProgress, showRuntimeExpansion, type RuntimeCardState } from "./runtimeCard";
import { consumeBuffering, failureMessage, progressDetail, progressSubject, renderModelCard, stagedMessage, statusLabel } from "./modelCard";

const RETURN_DELAY_MS = 600;
const PENDING_TOAST_MS = 6000;
const STAGING_TOAST_MS = 7000;

const renderPage = (): string => {
  const searchLabel = t("models.search.placeholder");
  return `
  <section class="step">
    <div class="page-header">
      <h1 class="page-title">${th("nav.models")}</h1>
      <div class="action-group"><button type="button" class="action-pill" id="models-check-updates">${th("models.updates.check")}</button></div>
    </div>
    <p class="page-subtitle">${th("models.subtitle")}</p>
    <div class="search-row">
      <div class="search-field">
        <input type="search" id="models-search-input" class="search-field__input" placeholder="${searchLabel}" aria-label="${searchLabel}" />
        <button type="button" class="preview-search-clear icon-btn" id="models-search-clear" ${labelAttrs(t("preview.clearSearch"))} hidden>${CLOSE_ICON}</button>
      </div>
    </div>
    <div class="tab-strip" id="models-tabs" role="tablist" aria-label="${th("models.tabs.label")}" hidden></div>
    <div id="models-list" role="tabpanel"></div>
  </section>`;
};

const UNDO_TICK_MS = 250;
const RUNTIME_TAB = "runtime";
type PageTab = ModelKind | typeof RUNTIME_TAB;
const kindTabId = (kind: PageTab): string => `models-tab-${kind}`;
const kindPanelId = "models-list";
const isPageTab = (value: string | null): value is PageTab => value === RUNTIME_TAB || (value !== null && Object.keys(MODEL_KINDS).includes(value));
const tabTitleKey = (tab: PageTab): TranslationKey => (tab === RUNTIME_TAB ? "models.runtime.tab" : MODEL_KINDS[tab].titleKey);

export function mount(container: HTMLElement, signal: AbortSignal): void {
  applyPageMeta("models");
  container.innerHTML = renderPage();
  const query = scopedQuery(container);
  const list = query<HTMLElement>("#models-list");
  const tabs = query<HTMLElement>("#models-tabs");
  const searchInput = query<HTMLInputElement>("#models-search-input");
  const searchClear = query<HTMLButtonElement>("#models-search-clear");
  const checkButton = query<HTMLButtonElement>("#models-check-updates");
  const smoothers = new Map<string, SmoothProgress>();
  let runtimeFill: HTMLElement | null = null;
  let runtimeTrack: Element | null = null;
  let runtimeAnnounced = -1;
  let runtimeFailureAnnounced = false;
  const runtimeSmoother = createSmoothProgress((fraction) => {
    if (!runtimeFill?.isConnected) {
      runtimeFill = list.querySelector<HTMLElement>("[data-runtime-fill]");
      runtimeTrack = list.querySelector("[data-runtime-card] [role=progressbar]");
      runtimeAnnounced = -1;
    }
    runtimeFill?.style.setProperty("--progress", fraction.toFixed(4));
    if (fraction >= MIN_VISIBLE_FRACTION) runtimeFill?.classList.remove("task-progress-fill--indeterminate");
    const percent = Math.min(100, Math.floor(fraction * 100));
    if (percent === runtimeAnnounced) return;
    runtimeAnnounced = percent;
    runtimeTrack?.setAttribute("aria-valuenow", String(percent));
  });
  const stageNames = new Map<string, string>();
  const expanded = new Set<string>();
  let rendered = "";
  let frame = 0;
  let returning = false;
  let undoTicker: number | undefined;
  let announcedPhase = updateCheckState().phase;
  let activeKind: PageTab | null = null;
  let searchText = "";
  let renderedKinds = "";
  const announcedFailures = new Map<string, string>();
  const announcedStaging = new Map<string, string>();
  const pendingId = pendingRecognitionModel();
  const pendingRecord = pendingId === null ? null : modelView(pendingId).record;
  if (pendingId !== null && pendingRecord?.enabled !== true) showToastMessage(pendingRecord ? t("models.pending.disabled", { name: findModel(pendingId)!.name }) : t("models.pending.banner"), PENDING_TOAST_MS);

  const layoutKey = (): string => listModelViews().map((view) => `${view.manifest.id}:${view.manifest.version}:${view.manifest.bytes}:${view.status}:${view.record?.enabled}:${view.updateAvailable}:${view.failure}:${view.staged.join("+")}:${updateCheckState().phase}:${view.record?.installedAt}:${expanded.has(view.manifest.id)}:${activeKind}:${searchText}:${isRemovalPending(view.manifest.id)}`).join("|") + `|${runtimeCardKey(runtimeView(), runtimeCardState())}`;

  const runtimeCardState = (): RuntimeCardState => ({
    removable: isRuntimeRemovable(),
    controllable: isRuntimeControllable(),
    expanded: expanded.has(RUNTIME_TAB),
    undoSeconds: runtimeRemovalSecondsLeft(),
    shownFraction: runtimeSmoother.value(),
  });

  const installable = (): ModelView[] => listModelViews().filter(({ manifest, record }) => !manifest.deprecated || record);

  const isSearching = (): boolean => searchText.trim() !== "";

  const modelKinds = (): PageTab[] => [...new Set<PageTab>(installable().map(({ manifest }) => MODEL_KINDS[manifest.kind].tab)), ...(hasRuntimeAssets() ? [RUNTIME_TAB as PageTab] : [])];

  function showKind(kind: PageTab): void {
    activeKind = kind;
    renderList();
  }

  function renderTabs(kinds: readonly PageTab[]): void {
    tabs.hidden = !kinds.length || isSearching();
    if (kinds.join() !== renderedKinds) {
      renderedKinds = kinds.join();
      tabs.innerHTML = kinds.map((kind) => `<div class="tab-strip__tab" role="tab" tabindex="-1" id="${kindTabId(kind)}" aria-controls="${kindPanelId}" data-kind="${kind}">${th(tabTitleKey(kind))}</div>`).join("");
    }
    syncTabButtons(tabs.querySelectorAll<HTMLElement>("[data-kind]"), (button) => button.dataset.kind === activeKind, "tab-strip__tab--active");
    if (activeKind && !isSearching()) {
      list.setAttribute("role", "tabpanel");
      list.setAttribute("aria-labelledby", kindTabId(activeKind));
    } else {
      list.removeAttribute("role");
      list.removeAttribute("aria-labelledby");
    }
  }

  function renderCards(rows: readonly ModelView[]): string {
    if (!rows.length) return `<p class="empty-state">${th("models.search.empty")}</p>`;
    return rows.map((view) => renderModelCard(view, expanded.has(view.manifest.id), smoothers.get(view.manifest.id)?.value() === undefined ? undefined : smoothers.get(view.manifest.id)!.value() * 100, removalSecondsLeft(view.manifest.id))).join("");
  }

  function renderGroup(kind: PageTab | null): string {
    if (kind === RUNTIME_TAB && !isSearching()) return `<section class="model-group"><p class="model-group__desc">${th("models.runtime.intro")}</p><div class="model-group__cards">${renderRuntimeCard(runtimeView(), runtimeCardState())}</div></section>`;
    const searching = isSearching();
    const rows = searching ? filterModelViews(installable(), searchText) : installable().filter(({ manifest }) => MODEL_KINDS[manifest.kind].tab === kind);
    const description = !searching && kind && kind !== RUNTIME_TAB ? `<p class="model-group__desc">${th(MODEL_KINDS[kind].descriptionKey!)}</p>` : "";
    return `
      <section class="model-group">
        ${description}
        <div class="model-group__cards">${renderCards(rows)}</div>
      </section>`;
  }

  function cardAnchor(preferredId: string | undefined): { id: string; top: number } | null {
    const focusedCard = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement.closest<HTMLElement>("[data-model]") : null;
    const cards = [...list.querySelectorAll<HTMLElement>("[data-model]")];
    const card = (preferredId ? cards.find((candidate) => candidate.dataset.model === preferredId) : undefined) ?? focusedCard ?? cards.find((candidate) => candidate.getBoundingClientRect().bottom > 0);
    return card?.dataset.model ? { id: card.dataset.model, top: card.getBoundingClientRect().top } : null;
  }

  function renderList(anchorId?: string): void {
    const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
    const selector = focused ? `[data-model="${focused.closest<HTMLElement>("[data-model]")?.dataset.model}"] [data-action="${focused.dataset.action ?? focused.closest<HTMLElement>("[data-action]")?.dataset.action}"]` : null;
    const anchor = cardAnchor(anchorId);
    const kinds = modelKinds();
    if (!activeKind || !kinds.includes(activeKind)) activeKind = kinds[0] ?? null;
    renderTabs(kinds);
    list.innerHTML = renderGroup(activeKind);
    checkButton.disabled = !hasCheckableContent();
    keepUndoTicking();
    rendered = layoutKey();
    if (selector) list.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    const shifted = anchor && list.querySelector<HTMLElement>(`[data-model="${anchor.id}"]`)?.getBoundingClientRect().top;
    if (anchor && shifted !== undefined && shifted !== null && Math.abs(shifted - anchor.top) >= 1) window.scrollBy(0, shifted - anchor.top);
  }

  function smootherFor(id: string): SmoothProgress {
    const existing = smoothers.get(id);
    if (existing) return existing;
    let fill: HTMLElement | null = null;
    let track: Element | null = null;
    let announced = -1;
    const created = createSmoothProgress((fraction) => {
      if (!fill?.isConnected) {
        const row = list.querySelector<HTMLElement>(`[data-model="${id}"]`);
        fill = row?.querySelector<HTMLElement>("[data-progress-fill]") ?? null;
        track = row?.querySelector("[role=progressbar]") ?? null;
        announced = -1;
      }
      fill?.style.setProperty("--progress", fraction.toFixed(4));
      if (fraction >= MIN_VISIBLE_FRACTION) fill?.classList.remove("task-progress-fill--indeterminate");
      const percent = Math.min(100, Math.floor(fraction * 100));
      if (percent === announced) return;
      announced = percent;
      track?.setAttribute("aria-valuenow", String(percent));
    });
    smoothers.set(id, created);
    return created;
  }

  function freezeIdleSmoothers(): void {
    smoothers.forEach((smoother, id) => {
      if (modelView(id).status !== "downloading") smoother.stop();
    });
  }

  function patchRuntime(): void {
    const view = runtimeView();
    patchRuntimeProgress(list, view, runtimeSmoother.value());
    if (view.phase === "downloading") runtimeSmoother.set(runtimeProgress(view).fraction);
    else if (view.phase === "paused") runtimeSmoother.stop();
    else if (runtimeSmoother.value() > 0) runtimeSmoother.reset();
  }

  function patchProgress(): void {
    patchRuntime();
    list.querySelectorAll<HTMLElement>("[data-model]").forEach((row) => {
      const id = row.dataset.model!;
      const view = modelView(id);
      row.querySelector("[data-status-label]")!.textContent = statusLabel(view);
      if (view.status === "downloading") {
        const subject = progressSubject(view);
        const name = row.querySelector("[data-progress-name]");
        if (name && name.textContent !== subject.name) name.textContent = subject.name;
        const smoother = smootherFor(id);
        const fraction = subject.total ? subject.loaded / subject.total : 0;
        if (stageNames.get(id) !== subject.name) {
          const nextStage = stageNames.has(id);
          if (nextStage) consumeBuffering(id);
          stageNames.set(id, subject.name);
          smoother.reset(nextStage ? 0 : fraction);
        }
        if (fraction >= 0.01) consumeBuffering(id);
        smoother.set(fraction);
        row.querySelector("[data-progress-fill]")?.classList.toggle("task-progress-fill--indeterminate", subject.waiting && smoother.value() < MIN_VISIBLE_FRACTION);
        row.querySelector("[data-progress-detail]")!.textContent = progressDetail(view);
      } else if (view.status === "paused") {
        smoothers.get(id)?.stop();
      } else {
        stageNames.delete(id);
        if (smoothers.has(id)) {
          smoothers.get(id)!.stop();
          smoothers.delete(id);
        }
      }
    });
  }

  const hasCheckableContent = (): boolean => runtimeView().phase === "installed" || listModelViews().some(({ record }) => record !== null);

  const hasPendingRemoval = (): boolean => isRuntimeRemovalPending() || listModelViews().some((view) => isRemovalPending(view.manifest.id));

  function keepUndoTicking(): void {
    if (undoTicker !== undefined || !hasPendingRemoval()) return;
    undoTicker = window.setInterval(() => {
      const setCountdown = (row: Element, seconds: number | null): void => {
        const label = row.querySelector("[data-undo-label]");
        if (seconds !== null && label) label.textContent = t("common.undoCountdown", { seconds });
      };
      list.querySelectorAll<HTMLElement>("[data-model]").forEach((row) => setCountdown(row, removalSecondsLeft(row.dataset.model!)));
      list.querySelectorAll("[data-runtime-card]").forEach((row) => setCountdown(row, runtimeRemovalSecondsLeft()));
      if (!hasPendingRemoval()) {
        window.clearInterval(undoTicker);
        undoTicker = undefined;
      }
    }, UNDO_TICK_MS);
  }

  function announceModelStates(): void {
    const runtimeFailed = runtimeView().phase === "failed";
    if (runtimeFailed && !runtimeFailureAnnounced) showToastMessage(t("models.runtime.failed"));
    runtimeFailureAnnounced = runtimeFailed;
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
    const { phase, available, webApp } = updateCheckState();
    checkButton.disabled = phase === "checking" || !hasCheckableContent();
    if (phase === announcedPhase) return;
    announcedPhase = phase;
    if (phase === "checking") showToastMessage(t("models.updates.checking"));
    else if (phase === "failed") showToastMessage(t("models.updates.failed"));
    else if (phase === "done") showToastMessage(webApp ? t("models.runtime.updateAvailable") : t(available ? "models.updates.available" : "models.updates.none", { count: available }));
  }

  function revealFromHash(): void {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (isPageTab(hash)) return showKind(hash);
    if (hash === RUNTIME_ANCHOR && hasRuntimeAssets()) {
      activeKind = RUNTIME_TAB;
      expanded.add(RUNTIME_TAB);
      renderList();
      list.querySelector("[data-runtime-card]")?.scrollIntoView({ block: "start" });
      return;
    }
    const target = findModelByAnchor(hash);
    if (!target) return;
    activeKind = MODEL_KINDS[target.kind].tab;
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
      if (layoutKey() !== rendered) {
        freezeIdleSmoothers();
        renderList();
      }
      patchProgress();
      void resumePendingRecognition();
    });
  }

  function showExpansion(id: string): void {
    const card = list.querySelector<HTMLElement>(`[data-model="${id}"]`);
    if (!card) return renderList(id);
    const open = expanded.has(id);
    card.classList.toggle("model-card--expanded", open);
    card.querySelector("[data-action=\"toggle\"]")?.setAttribute("aria-expanded", String(open));
    card.querySelector(".model-card__chevron")?.classList.toggle("model-card__chevron--open", open);
    card.querySelector<HTMLElement>(".model-card__details")!.hidden = !open;
    rendered = layoutKey();
  }

  let hashBeforeCards: string | null = null;

  const isCardAnchorHash = (): boolean => {
    const hash = decodeURIComponent(location.hash.slice(1));
    return hash === RUNTIME_ANCHOR || findModelByAnchor(hash) !== undefined;
  };

  function writeHash(hash: string): void {
    history.replaceState(null, "", hash === "" ? location.pathname + location.search : hash);
  }

  function recordCardHash(anchor: string, open: boolean): void {
    if (open) {
      if (!isCardAnchorHash()) hashBeforeCards = location.hash;
      writeHash(`#${anchor}`);
    } else if (location.hash === `#${anchor}`) {
      writeHash(hashBeforeCards ?? "");
    }
  }

  function toggleCard(id: string): void {
    const open = !expanded.delete(id);
    if (open) expanded.add(id);
    recordCardHash(modelAnchor(findModel(id)!), open);
    showExpansion(id);
  }

  function isCardSurfaceClick(target: HTMLElement): boolean {
    if (target.closest("a, button, input, label, summary, details")) return false;
    if (window.getSelection()?.toString()) return false;
    return target.closest(".model-card__details") === null;
  }

  function toggleRuntimeCard(card: HTMLElement): void {
    const open = !expanded.has(RUNTIME_TAB);
    if (open) expanded.add(RUNTIME_TAB);
    else expanded.delete(RUNTIME_TAB);
    recordCardHash(RUNTIME_ANCHOR, open);
    showRuntimeExpansion(card, open);
    rendered = layoutKey();
  }

  function handleRuntimeClick(card: HTMLElement, clicked: HTMLElement): void {
    const action = clicked.closest<HTMLElement>("[data-runtime-action]")?.dataset.runtimeAction;
    if (card.classList.contains("model-card--pending-delete") && action !== "remove") return;
    if (!action) {
      if (isCardSurfaceClick(clicked)) toggleRuntimeCard(card);
      return;
    }
    switch (action) {
      case "install": void installRuntime(); break;
      case "pause": pauseRuntime(); break;
      case "cancel": cancelRuntime(); break;
      case "remove": toggleRuntimeRemoval(); break;
      case "toggle": toggleRuntimeCard(card); break;
    }
  }

  list.addEventListener("click", (event) => {
    const clicked = event.target as HTMLElement;
    const runtimeCard = clicked.closest<HTMLElement>("[data-runtime-card]");
    if (runtimeCard) return handleRuntimeClick(runtimeCard, clicked);
    const card = clicked.closest<HTMLElement>("[data-model]");
    const id = card?.dataset.model;
    if (!card || !id) return;
    const target = clicked.closest<HTMLElement>("[data-action]");
    if (card.classList.contains("model-card--pending-delete") && target?.dataset.action !== "remove") return;
    if (!target) {
      if (isCardSurfaceClick(clicked)) toggleCard(id);
      return;
    }
    switch (target.dataset.action) {
      case "install": void installModel(id); break;
      case "pause": pauseModelInstall(id); break;
      case "cancel": cancelModelInstall(id); clearPendingRecognition(); break;
      case "discard": discardStagedFiles(id); break;
      case "enable": setModelEnabled(id, true); break;
      case "disable": setModelEnabled(id, false); releaseModels(findModel(id)!.kind); break;
      case "remove": toggleModelRemoval(id); break;
      case "import": target.parentElement?.querySelector<HTMLInputElement>("[data-import-input]")?.click(); break;
      case "download": window.setTimeout(() => {
        expanded.add(id);
        showExpansion(id);
      }, 0); break;
      case "export": void exportModelPackage(id).then((archive) => archive && saveBlob(archive.blob, archive.filename)); break;
      case "toggle": toggleCard(id); break;
    }
  }, { signal });

  subscribeDeletionSettled(sync, signal);
  window.addEventListener("hashchange", revealFromHash, { signal });

  mountTabStrip(tabs, (tab) => {
    const kind = tab.dataset.kind ?? null;
    if (!isPageTab(kind)) return;
    if (location.hash !== `#${kind}`) history.replaceState(null, "", `#${kind}`);
    if (kind !== activeKind) showKind(kind);
  }, signal);

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
  const unsubscribeRuntime = subscribeRuntime(sync);
  void refreshRuntime();
  signal.addEventListener("abort", () => {
    cancelAnimationFrame(frame);
    smoothers.forEach((smoother) => smoother.stop());
    runtimeSmoother.stop();
    window.clearInterval(undoTicker);
    unsubscribe();
    unsubscribeRuntime();
  }, { once: true });
  void refreshModels({ urgent: true }).then(() => {
    if (signal.aborted) return;
    sync();
    revealFromHash();
  });
}
