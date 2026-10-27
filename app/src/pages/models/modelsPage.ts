import { setPageMeta } from "../../config/head";
import { getLocale, t } from "../../i18n";
import { clearPendingRecognition, pendingRecognitionModel } from "../../lib/entities/pendingRecognition";
import { findModel } from "../../lib/models/catalog";
import { cancelModelInstall, importModelFiles, installModel, isModelReady, listModelViews, modelView, refreshModels, removeModel, setModelEnabled, subscribeModels } from "../../lib/models/manager";
import { disposeNerRuntime, ensureNerRuntime } from "../../lib/models/ner/client";
import { HOME_PAGE_ID } from "../../render/paths";
import { buildPath, navigate } from "../../router/router";
import { scopedQuery } from "../../utils/dom";
import { percentOf, progressDetail, renderModelRow, statusLabel } from "./modelRow";

const RETURN_DELAY_MS = 600;

const renderPage = (): string => `
  <section class="step models-page">
    <div class="history-page-header">
      <h1 class="history-page-title">${t("nav.models")}</h1>
    </div>
    <p class="history-page-subtitle">${t("models.subtitle")}</p>
    <p class="models-banner" id="models-banner" role="status" hidden>${t("models.pending.banner")}</p>
    <div class="history-list models-list" id="models-list"></div>
  </section>`;

export function mount(container: HTMLElement, signal: AbortSignal): void {
  setPageMeta(t("nav.models"), t("meta.models.description"));
  container.innerHTML = renderPage();
  const query = scopedQuery(container);
  const list = query<HTMLElement>("#models-list");
  const banner = query<HTMLElement>("#models-banner");
  const expanded = new Set<string>();
  let rendered = "";
  let frame = 0;
  let returning = false;

  const layoutKey = (): string => listModelViews().map((view) => `${view.manifest.id}:${view.status}:${view.record?.enabled}:${view.updateAvailable}:${view.failure}:${view.record?.installedAt}:${expanded.has(view.manifest.id)}`).join("|");

  function renderList(): void {
    const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
    const selector = focused ? `[data-model="${focused.closest<HTMLElement>("[data-model]")?.dataset.model}"] [data-action="${focused.dataset.action ?? focused.closest<HTMLElement>("[data-action]")?.dataset.action}"]` : null;
    list.innerHTML = listModelViews().map((view) => renderModelRow(view, expanded.has(view.manifest.id))).join("");
    rendered = layoutKey();
    if (selector) list.querySelector<HTMLElement>(selector)?.focus();
  }

  function patchProgress(): void {
    list.querySelectorAll<HTMLElement>("[data-model]").forEach((row) => {
      const view = modelView(row.dataset.model!);
      const percent = percentOf(view);
      row.querySelector("[data-status-label]")!.textContent = statusLabel(view);
      const fill = row.querySelector<HTMLElement>("[data-progress-fill]");
      if (fill && view.status === "downloading") {
        fill.style.width = `${percent}%`;
        fill.closest("[role=progressbar]")?.setAttribute("aria-valuenow", String(percent));
        row.querySelector("[data-progress-detail]")!.textContent = progressDetail(view);
      }
    });
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
      case "cancel": cancelModelInstall(id); clearPendingRecognition(); break;
      case "enable": setModelEnabled(id, true); break;
      case "disable": setModelEnabled(id, false); disposeNerRuntime(); break;
      case "remove": disposeNerRuntime(); void removeModel(id); break;
      case "import": target.parentElement?.querySelector<HTMLInputElement>("[data-import-input]")?.click(); break;
      case "toggle":
        if (!expanded.delete(id)) expanded.add(id);
        renderList();
        break;
    }
  }, { signal });

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
    unsubscribe();
  }, { once: true });
  void refreshModels().then(() => {
    if (!signal.aborted) sync();
  });
}
