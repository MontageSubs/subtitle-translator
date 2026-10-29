import { t } from "../../../i18n";
import { syncTabButtons } from "../../tabList";
import { buildPath, getRoute, navigate } from "../../../router/router";
import { languageLabel } from "../../../utils/languageProfiles";
import { DEFAULT_SCENE_CHANGE_SECONDS } from "../../../lib/subtitle/common/sceneThreads";
import { openModal } from "../../modal";
import { createCardsView } from "../list/cardsView";
import { ensureSceneIndexes } from "../metrics/sceneIndex";
import { ErrorCategoryKey, CardErrorInfo, PreviewCard, PreviewModalHandle, PreviewModalOptions, UndoEntry } from "../types";
import { AnCornerOrDefault } from "../../../lib/subtitle/formats/topAlign";
import { SINGLE_POSITION_RULE } from "../../../lib/subtitle/formats/cueLayout";
import { mountAssistTabs } from "./assistTabs";
import { mountCardEditor } from "./cardEditor";
import { collapseLineBreaks, dropBlankLines } from "../../../lib/subtitle/postprocess/displayText";
import { shouldWrapTranslation } from "../../../lib/subtitle/postprocess/lineWrap";
import { createEditModel } from "./editModel";
import { createOverlay } from "./overlay";
import { createDirtyState, readEditSignature } from "./dirtyState";
import { ReplayDirection, mountEditHistory } from "./editHistory";
import { mountErrorPanel } from "./errorPanel";
import { mountKeyboard } from "./keyboard";
import { PREVIEW_TABS, PreviewTab, panelId, renderPreviewModal } from "./markup";
import { mountRawViews } from "./rawViews";
import { initialSearchMode, isFilterOnlyPersisted, mountSearchBar } from "./searchBar";
import type { PreviewSession } from "./session";
import { mountWindowState } from "./windowState";

export function openPreviewModal(
  rawTarget: string,
  rawSource: string,
  inputCards: PreviewCard[],
  options: PreviewModalOptions = {}
): PreviewModalHandle {
  const cards = ensureSceneIndexes(inputCards, options.sceneSeconds ?? DEFAULT_SCENE_CHANGE_SECONDS);
  const reportHref = buildPath(getRoute().locale, "docs", ["feedback"]);
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
      dirty.rebase();
    },
  });
  const { backdrop, query } = modal;
  const dirty = createDirtyState(
    backdrop.querySelectorAll<HTMLButtonElement>("#preview-apply, .preview-apply-btn"),
    () => readEditSignature({ editor, positions, assist })
  );
  const singleLine = !shouldWrapTranslation(options.outputMode ?? "monolingual", options.cueLayout ?? "single");
  const editor = createEditModel(cards, singleLine ? collapseLineBreaks : dropBlankLines);
  const positionRule = options.positionRule ?? SINGLE_POSITION_RULE;
  const basePositionById = new Map(cards.map((card) => [card.id, card.topAlignAn ?? positionRule.defaultAn]));
  const positions = createOverlay<AnCornerOrDefault>((id) => basePositionById.get(id) ?? positionRule.defaultAn);

  function replayChanges(entry: UndoEntry, direction: ReplayDirection): void {
    entry.forEach((change) => {
      if (change.kind === "text") editor.set(change.id, change[direction]);
      else positions.assign(change.id, change[direction]);
    });
  }

  const session = {
    backdrop,
    signal: modal.signal,
    options,
    cards,
    editor,
    errorMap: new Map<number, CardErrorInfo>(),
    activeCategories: new Set<ErrorCategoryKey>(),
    positions,
    positionRule,
    selectedForBatch: new Set<number>(),
    singleLine,
    softWarningMode: singleLine,
    searchMode: initialSearchMode(),
    activeTab: "cards" as PreviewTab,
    query,
    syncDirty: dirty.sync,
    selectTab(tab: PreviewTab) {
      session.activeTab = tab;
      syncTabButtons(backdrop.querySelectorAll<HTMLElement>(".modal__tab"), (element) => element.dataset.tab === tab, "modal__tab--active");
      PREVIEW_TABS.forEach((id) => { query(`#${panelId(id)}`).hidden = id !== tab; });
    },
  } as PreviewSession;

  const assist = mountAssistTabs(session);
  const rawViews = mountRawViews(session, rawSource, rawTarget);
  session.view = createCardsView(query(".preview-cards-host"), cards, session);
  session.errors = mountErrorPanel(session);
  session.history = mountEditHistory({
    undoButton: query("#preview-undo"),
    redoButton: query("#preview-redo"),
    replay: replayChanges,
    onChange: dirty.sync,
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
      edits: editor.unapplied(),
      contextText: assist.contextText(),
      glossaryEntries: assist.glossary.getEntries(),
      positionEdits: positions.unapplied(),
    });
    if (result?.rawSrt !== undefined) rawViews.updateTarget(result.rawSrt);
    if (result?.lastUpdatedLabel !== undefined) query<HTMLElement>("#preview-updated-label").textContent = result.lastUpdatedLabel;
    editor.markApplied();
    positions.markApplied();
    dirty.rebase();
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
  mountKeyboard(session);

  dirty.rebase();
  query<HTMLButtonElement>(".modal__tab").focus();
  session.errors.render();
  session.search.refresh();

  return { close: modal.close };
}
