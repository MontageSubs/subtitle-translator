import { t } from "../../../i18n";
import { buildPath, getRoute, navigate } from "../../../router/router";
import { languageLabel } from "../../../utils/languageProfiles";
import { DEFAULT_SCENE_CHANGE_SECONDS } from "../../../lib/subtitle/common/sceneThreads";
import { openModal } from "../../modal";
import { createCardsView } from "../list/cardsView";
import { ensureSceneIndexes } from "../metrics/sceneIndex";
import { ErrorCategoryKey, CardErrorInfo, PreviewCard, PreviewModalHandle, PreviewModalOptions } from "../types";
import { AnCornerOrDefault } from "../../../lib/subtitle/formats/topAlign";
import { mountAssistTabs } from "./assistTabs";
import { mountCardEditor } from "./cardEditor";
import { createEditModel } from "./editModel";
import { createDirtyState } from "./dirtyState";
import { mountEditHistory } from "./editHistory";
import { mountErrorPanel } from "./errorPanel";
import { mountKeyboard } from "./keyboard";
import { PreviewTab, renderPreviewModal } from "./markup";
import { mountRawViews } from "./rawViews";
import { initialSearchMode, isFilterOnlyPersisted, mountSearchBar } from "./searchBar";
import type { PreviewSession } from "./session";
import { mountWindowState } from "./windowState";

const TAB_PANELS: Record<PreviewTab, string> = {
  cards: "#preview-cards-container",
  context: "#preview-context-container",
  glossary: "#preview-glossary-container",
  "raw-source": "#preview-raw-source-container",
  "raw-target": "#preview-raw-target-container",
  compare: "#preview-compare-container",
};

export function openPreviewModal(
  rawTarget: string,
  rawSource: string,
  inputCards: PreviewCard[],
  options: PreviewModalOptions = {}
): PreviewModalHandle {
  const cards = ensureSceneIndexes(inputCards, options.sceneSeconds ?? DEFAULT_SCENE_CHANGE_SECONDS);
  const reportHref = buildPath(getRoute().locale, "docs", ["report-issue"]);
  const sourceCode = options.sourceLang;
  const targetCode = options.targetLang || cards[0]?.targetLang;
  const modal = openModal({
    html: renderPreviewModal({
      reportHref,
      sourceLabel: sourceCode ? languageLabel(sourceCode) : t("preview.tabRawSource"),
      targetLabel: targetCode ? languageLabel(targetCode) : t("preview.tabRawTarget"),
      lastUpdatedLabel: options.lastUpdatedLabel ?? "",
      filterOnly: isFilterOnlyPersisted(),
    }),
    requestClose: () => !dirty.isDirty || window.confirm(t("preview.unsavedWarning")),
    onClosed: () => {
      windowState.dispose();
      dirty.clear();
    },
  });
  const { backdrop, query } = modal;
  const dirty = createDirtyState(backdrop.querySelectorAll<HTMLButtonElement>("#preview-apply, .preview-apply-btn"));
  const editor = createEditModel(cards);
  const positionEdits = new Map<number, AnCornerOrDefault>();

  const session = {
    backdrop,
    signal: modal.signal,
    options,
    cards,
    editor,
    errorMap: new Map<number, CardErrorInfo>(),
    activeCategories: new Set<ErrorCategoryKey>(),
    positionEdits,
    selectedForBatch: new Set<number>(),
    softWarningMode: options.outputMode === "bilingual" && options.cueLayout !== "split",
    searchMode: initialSearchMode(),
    activeTab: "cards" as PreviewTab,
    query,
    markDirty: dirty.mark,
    selectTab(tab: PreviewTab) {
      session.activeTab = tab;
      backdrop.querySelectorAll<HTMLElement>(".modal__tab").forEach((element) => {
        const selected = element.dataset.tab === tab;
        element.classList.toggle("modal__tab--active", selected);
        element.setAttribute("aria-selected", String(selected));
        if (selected) element.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      });
      (Object.keys(TAB_PANELS) as PreviewTab[]).forEach((id) => { query(TAB_PANELS[id]).hidden = id !== tab; });
    },
  } as PreviewSession;

  const assist = mountAssistTabs(session);
  const rawViews = mountRawViews(session, rawSource, rawTarget);
  session.view = createCardsView(query(".preview-cards-host"), cards, session);
  session.errors = mountErrorPanel(session);
  session.history = mountEditHistory({
    undoButton: query("#preview-undo"),
    redoButton: query("#preview-redo"),
    editor,
    onChange: dirty.mark,
    onApplied: () => {
      session.errors.render();
      session.search.refresh();
    },
  });
  session.search = mountSearchBar(session);
  mountCardEditor(session, query(".preview-cards-host"));

  const windowState = mountWindowState(backdrop, query(".preview-modal-box"));

  function apply(): void {
    if (!dirty.isDirty) return;
    const result = options.onApply?.({
      edits: editor.snapshot(),
      contextText: assist.contextText(),
      glossaryEntries: assist.glossary.getEntries(),
      positionEdits: new Map(positionEdits),
    });
    if (result?.rawSrt !== undefined) rawViews.updateTarget(result.rawSrt);
    if (result?.lastUpdatedLabel !== undefined) query<HTMLElement>("#preview-updated-label").textContent = result.lastUpdatedLabel;
    dirty.clear();
  }

  backdrop.querySelectorAll<HTMLButtonElement>("#preview-apply, .preview-apply-btn").forEach((button) => button.addEventListener("click", apply));
  backdrop.querySelectorAll<HTMLButtonElement>(".modal__tab").forEach((tab) => {
    tab.addEventListener("click", () => session.selectTab(tab.dataset.tab as PreviewTab));
  });
  query(".modal__maximize").addEventListener("click", windowState.toggleMaximized);
  backdrop.querySelectorAll(".preview-report-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (modal.requestClose()) navigate(reportHref);
    });
  });
  mountKeyboard(session, { requestClose: modal.requestClose });

  query<HTMLButtonElement>(".modal__tab").focus();
  session.errors.render();
  session.search.refresh();

  return { close: modal.close };
}
