import { setPageMeta } from "../../config/head";
import { getLocale, t } from "../../i18n";
import { clearPendingRecognition, pendingRecognitionModel } from "../../lib/entities/pendingRecognition";
import { DELETION_UNDO_WINDOW_MS, cancelDeletion, deletionRemainingMs, isDeletionQueued, queueDeletion, subscribeDeletionSettled } from "../../lib/history/deletionQueue";
import { findModel } from "../../lib/models/catalog";
import { cancelModelInstall, checkModelUpdates, discardStagedFiles, importModelFiles, installModel, isModelReady, listModelViews, modelView, pauseModelInstall, refreshModels, removeModel, setModelEnabled, subscribeModels, updateCheckState } from "../../lib/models/manager";
import { disposeNerRuntime, ensureNerRuntime } from "../../lib/models/ner/client";
import { HOME_PAGE_ID } from "../../render/paths";
import { buildPath, navigate } from "../../router/router";
import { scopedQuery } from "../../utils/dom";
import { createSmoothProgress, type SmoothProgress } from "../../utils/smoothProgress";
import type { TranslationKey } from "../../i18n";
import { progressDetail, renderModelRow, statusLabel } from "./modelRow";

const RETURN_DELAY_MS = 600;

const renderPage = (): string => `
  <section class="step">
    <div class="history-page-header">
      <h1 class="history-page-title">${t("nav.models")}</h1>
      <div class="history-action-group"><button type="button" class="action-pill" id="models-check-updates">${t("models.updates.check")}</button></div>
    </div>
    <p class="history-page-subtitle">${t("models.subtitle")}</p>
    <p class="models-banner" id="models-banner" role="status" hidden>${t("models.pending.banner")}</p>
    <p class="muted models-status" id="models-update-status" role="status" hidden></p>
    <div class="js-required js-required--compact" id="models-unsupported" role="note" hidden>
      <p class="js-required__title" id="models-unsupported-title"></p>
      <p class="muted" id="models-unsupported-hint"></p>
    </div>
    <div class="history-list models-list" id="models-list"></div>
  </section>`;

const UNDO_TICK_MS = 250;
const removalKey = (id: string): string => `models:${id}`;
const undoSecondsOf = (id: string): number | null => (isDeletionQueued(removalKey(id)) ? Math.max(1, Math.ceil(deletionRemainingMs(removalKey(id)) / 1000)) : null);

export function mount(container: HTMLElement, signal: AbortSignal): void {
  setPageMeta(t("nav.models"), t("meta.models.description"));
  container.innerHTML = renderPage();
  const query = scopedQuery(container);
  const list = query<HTMLElement>("#models-list");
  const banner = query<HTMLElement>("#models-banner");
  const unsupported = query<HTMLElement>("#models-unsupported");
  const updateStatus = query<HTMLElement>("#models-update-status");
  const checkButton = query<HTMLButtonElement>("#models-check-updates");
  const smoothers = new Map<string, SmoothProgress>();
  const expanded = new Set<string>();
  let rendered = "";
  let frame = 0;
  let returning = false;
  let undoTicker: number | undefined;

  const layoutKey = (): string => listModelViews().map((view) => `${view.manifest.id}:${view.status}:${view.record?.enabled}:${view.updateAvailable}:${view.failure}:${view.staged.join("+")}:${updateCheckState().phase}:${view.record?.installedAt}:${expanded.has(view.manifest.id)}:${isDeletionQueued(removalKey(view.manifest.id))}`).join("|");

  function renderList(): void {
    const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
    const selector = focused ? `[data-model="${focused.closest<HTMLElement>("[data-model]")?.dataset.model}"] [data-action="${focused.dataset.action ?? focused.closest<HTMLElement>("[data-action]")?.dataset.action}"]` : null;
    list.innerHTML = listModelViews().map((view) => renderModelRow(view, expanded.has(view.manifest.id), smoothers.has(view.manifest.id) ? Math.floor(smoothers.get(view.manifest.id)!.value() * 100) : undefined, undoSecondsOf(view.manifest.id))).join("");
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

  function paintNotices(): void {
    const incompatibility = listModelViews().find((view) => view.incompatibility)?.incompatibility ?? null;
    unsupported.hidden = incompatibility === null;
    list.hidden = incompatibility !== null;
    checkButton.hidden = incompatibility !== null;
    if (incompatibility) {
      query<HTMLElement>("#models-unsupported-title").textContent = t(`models.unsupported.${incompatibility}` as TranslationKey);
      query<HTMLElement>("#models-unsupported-hint").textContent = t("models.unsupported.hint");
    }
    const check = updateCheckState();
    const message: Record<string, TranslationKey | undefined> = { checking: "models.updates.checking", failed: "models.updates.failed" };
    const key = incompatibility ? undefined : check.phase === "done" ? (check.available ? "models.updates.available" : "models.updates.none") : message[check.phase];
    updateStatus.hidden = !key;
    updateStatus.textContent = key ? t(key, { count: check.available }) : "";
    checkButton.disabled = check.phase === "checking";
  }

  async function resumePendingRecognition(): Promise<void> {
    const modelId = pendingRecognitionModel();
    const manifest = modelId ? findModel(modelId) : undefined;
    if (!manifest || returning || !isModelReady(manifest.id)) return;
    returning = true;
    try {
      await ensureNerRuntime(manifest);
    } catch {
      returning = false;
      clearPendingRecognition();
      banner.hidden = true;
      return;
    }
    window.setTimeout(() => {
      if (!signal.aborted) navigate(buildPath(getLocale(), HOME_PAGE_ID));
    }, RETURN_DELAY_MS);
  }

  function sync(): void {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      banner.hidden = pendingRecognitionModel() === null;
      paintNotices();
      if (layoutKey() === rendered) patchProgress();
      else renderList();
      void resumePendingRecognition();
    });
  }

  list.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    const id = target?.closest<HTMLElement>("[data-model]")?.dataset.model;
    if (!target || !id) return;
    switch (target.dataset.action) {
      case "install": void installModel(id); break;
      case "pause": pauseModelInstall(id); break;
      case "cancel": cancelModelInstall(id); clearPendingRecognition(); break;
      case "discard": discardStagedFiles(id); break;
      case "enable": setModelEnabled(id, true); break;
      case "disable": setModelEnabled(id, false); disposeNerRuntime(); break;
      case "remove":
        if (!cancelDeletion(removalKey(id))) queueDeletion(removalKey(id), DELETION_UNDO_WINDOW_MS, async () => {
          disposeNerRuntime();
          await removeModel(id);
        });
        renderList();
        break;
      case "import": target.parentElement?.querySelector<HTMLInputElement>("[data-import-input]")?.click(); break;
      case "toggle":
        if (!expanded.delete(id)) expanded.add(id);
        renderList();
        break;
    }
  }, { signal });

  list.addEventListener("keydown", (event) => {
    const main = (event.target as HTMLElement).closest<HTMLElement>(".model-row__main");
    if (event.target !== main || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    main?.click();
  }, { signal });

  subscribeDeletionSettled(sync, signal);

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
    if (!signal.aborted) sync();
  });
}
