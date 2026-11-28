import { getLocale, t } from "../../../i18n";
import { isPlainTextQuery } from "../list/cardsView";
import { CardsViewResult, PreviewCard, SearchMode, UndoEntry } from "../types";
import type { PreviewSession } from "./session";
import { formatNumber } from "../../../utils/numberFormat";

let persistedFilterOnly = false;

export function initialSearchMode(): SearchMode {
  return persistedFilterOnly ? "filter" : "highlight";
}

export function isFilterOnlyPersisted(): boolean {
  return persistedFilterOnly;
}

export interface SearchBarHandle {
  refresh(): void;
  step(direction: "next" | "prev"): void;
  isSearching(): boolean;
  focus(): void;
  openReplace(): void;
  closeReplaceIfOpen(): boolean;
}

function formatMatchCount(result: CardsViewResult, hasQuery: boolean): string {
  if (!hasQuery) return "";
  const locale = getLocale();
  if (result.matchedCount === 0) return `${formatNumber(0, locale)}/${formatNumber(0, locale)}`;
  return `${formatNumber(result.activeIndex >= 0 ? result.activeIndex + 1 : 1, locale)}/${formatNumber(result.matchedCount, locale)}`;
}

export function mountSearchBar(session: PreviewSession): SearchBarHandle {
  const input = session.query<HTMLInputElement>("#preview-search-input");
  const clearButton = session.query<HTMLButtonElement>("#preview-search-clear");
  const matchCount = session.query<HTMLElement>("#preview-match-count");
  const filterCheckbox = session.query<HTMLInputElement>("#preview-filter-checkbox");
  const previousButton = session.query<HTMLButtonElement>("#preview-prev-match");
  const nextButton = session.query<HTMLButtonElement>("#preview-next-match");
  const replaceBar = session.query<HTMLElement>("#preview-replace-bar");
  const replaceInput = session.query<HTMLInputElement>("#preview-replace-input");
  const replaceClearButton = session.query<HTMLButtonElement>("#preview-replace-clear");
  const replaceStatus = session.query<HTMLElement>("#preview-replace-status");
  const toolsToggle = session.query<HTMLButtonElement>("#preview-tools-toggle");
  const cardsPane = session.query<HTMLElement>(".preview-cards-pane");

  function setToolsExpanded(expanded: boolean): void {
    cardsPane.dataset.tools = expanded ? "expanded" : "collapsed";
    toolsToggle.setAttribute("aria-expanded", String(expanded));
  }

  function clearReplaceStatus(): void {
    replaceStatus.hidden = true;
    replaceStatus.replaceChildren();
  }

  function refresh(): void {
    clearReplaceStatus();
    const hasQuery = input.value.trim().length > 0;
    const result = session.view.setFilter(input.value, session.searchMode);
    previousButton.disabled = result.matchedCount <= 1;
    nextButton.disabled = result.matchedCount <= 1;
    matchCount.textContent = formatMatchCount(result, hasQuery);
    session.errors.renderMinimap();
  }

  function step(direction: "next" | "prev"): void {
    const result = session.view.navigateMatch(direction);
    if (result.matchedCount === 0) return;
    matchCount.textContent = formatMatchCount(result, true);
    session.errors.renderMinimap();
  }

  function countOriginalOnlyMatches(candidates: PreviewCard[], entry: UndoEntry, query: string): number {
    const needle = query.trim().toLowerCase();
    if (!isPlainTextQuery(needle)) return 0;
    const matchedIds = new Set(session.view.getMatchedIds());
    const replacedIds = new Set(entry.map((change) => change.id));
    return candidates.filter((card) => matchedIds.has(card.id) && !replacedIds.has(card.id) && (card.locked || !session.editor.targetOf(card).toLowerCase().includes(needle))).length;
  }

  function showReplaceStatus(replacedCount: number, originalOnlyCount: number): void {
    const lines = [
      replacedCount > 0 && t("preview.replaceDone", { count: replacedCount }),
      originalOnlyCount > 0 && t("preview.replaceSkippedOriginal", { count: originalOnlyCount }),
    ].filter(Boolean) as string[];
    if (lines.length === 0) lines.push(t("preview.replaceNoEditableMatch"));
    replaceStatus.replaceChildren(...lines.map((line) => Object.assign(document.createElement("span"), { textContent: line })));
    replaceStatus.hidden = false;
  }

  function applyReplacement(cards: PreviewCard[], all: boolean): void {
    const query = input.value;
    if (!query) return;
    const entry = session.editor.replace(cards, query, replaceInput.value, all);
    if (entry.length) session.history.push(entry);
    session.errors.render();
    refresh();
    showReplaceStatus(entry.length, countOriginalOnlyMatches(cards, entry, query));
  }

  function replaceOne(): void {
    const query = input.value;
    const activeId = session.view.getActiveMatchCardId();
    const card = activeId !== null
      ? session.cards.find((candidate) => candidate.id === activeId)
      : session.cards.find((candidate) => session.editor.targetOf(candidate).includes(query));
    applyReplacement(card ? [card] : [], false);
  }

  clearButton.addEventListener("pointerdown", (event) => event.preventDefault());
  clearButton.addEventListener("click", (event) => {
    event.preventDefault();
    input.value = "";
    refresh();
    input.focus();
  });
  replaceClearButton.addEventListener("click", () => {
    replaceInput.value = "";
    clearReplaceStatus();
    replaceInput.focus();
  });
  replaceInput.addEventListener("input", clearReplaceStatus);
  input.addEventListener("input", refresh);
  input.addEventListener("search", refresh);
  filterCheckbox.addEventListener("change", () => {
    persistedFilterOnly = filterCheckbox.checked;
    session.searchMode = initialSearchMode();
    refresh();
  });
  previousButton.addEventListener("click", () => step("prev"));
  nextButton.addEventListener("click", () => step("next"));
  toolsToggle.addEventListener("click", () => setToolsExpanded(cardsPane.dataset.tools !== "expanded"));
  session.query("#preview-toggle-replace").addEventListener("click", () => {
    replaceBar.hidden = !replaceBar.hidden;
    clearReplaceStatus();
    if (!replaceBar.hidden) replaceInput.focus();
  });
  session.query("#preview-replace-one").addEventListener("click", replaceOne);
  session.query("#preview-replace-all").addEventListener("click", () => applyReplacement(session.cards, true));

  return {
    refresh,
    step,
    isSearching: () => input.value.trim().length > 0,
    focus() {
      input.focus();
      input.select();
    },
    openReplace() {
      setToolsExpanded(true);
      replaceBar.hidden = false;
      replaceInput.focus();
      replaceInput.select();
    },
    closeReplaceIfOpen() {
      if (replaceBar.hidden) return false;
      replaceBar.hidden = true;
      clearReplaceStatus();
      input.focus();
      return true;
    },
  };
}
