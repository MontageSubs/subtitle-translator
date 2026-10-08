import { CardsViewResult, PreviewCard, SearchMode } from "../types";
import type { PreviewSession } from "./session";

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
  focus(): void;
  openReplace(): void;
  closeReplaceIfOpen(): boolean;
}

function formatMatchCount(result: CardsViewResult, hasQuery: boolean): string {
  if (!hasQuery) return "";
  if (result.matchedCount === 0) return "0/0";
  return `${result.activeIndex >= 0 ? result.activeIndex + 1 : 1}/${result.matchedCount}`;
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

  function refresh(): void {
    const hasQuery = input.value.trim().length > 0;
    const result = session.view.setFilter(input.value, session.searchMode);
    previousButton.disabled = result.matchedCount <= 1;
    nextButton.disabled = result.matchedCount <= 1;
    clearButton.hidden = !hasQuery;
    matchCount.textContent = formatMatchCount(result, hasQuery);
    session.errors.renderMinimap();
  }

  function step(direction: "next" | "prev"): void {
    const result = session.view.navigateMatch(direction);
    if (result.matchedCount === 0) return;
    matchCount.textContent = formatMatchCount(result, true);
    session.errors.renderMinimap();
  }

  function applyReplacement(cards: PreviewCard[], all: boolean): void {
    const query = input.value;
    if (!query) return;
    const entry = session.editor.replace(cards, query, replaceInput.value, all);
    if (entry.length) session.history.push(entry);
    session.errors.render();
    refresh();
  }

  function replaceOne(): void {
    const query = input.value;
    const activeId = session.view.getActiveMatchCardId();
    const card = activeId !== null
      ? session.cards.find((candidate) => candidate.id === activeId)
      : session.cards.find((candidate) => session.editor.targetOf(candidate).includes(query));
    if (card && query) applyReplacement([card], false);
  }

  clearButton.addEventListener("pointerdown", (event) => event.preventDefault());
  clearButton.addEventListener("click", (event) => {
    event.preventDefault();
    input.value = "";
    refresh();
    input.focus();
  });
  input.addEventListener("input", refresh);
  input.addEventListener("search", refresh);
  filterCheckbox.addEventListener("change", () => {
    persistedFilterOnly = filterCheckbox.checked;
    session.searchMode = initialSearchMode();
    refresh();
  });
  previousButton.addEventListener("click", () => step("prev"));
  nextButton.addEventListener("click", () => step("next"));
  session.query("#preview-toggle-replace").addEventListener("click", () => {
    replaceBar.hidden = !replaceBar.hidden;
    if (!replaceBar.hidden) replaceInput.focus();
  });
  session.query("#preview-replace-one").addEventListener("click", replaceOne);
  session.query("#preview-replace-all").addEventListener("click", () => applyReplacement(session.cards, true));

  return {
    refresh,
    step,
    focus() {
      input.focus();
      input.select();
    },
    openReplace() {
      replaceBar.hidden = false;
      replaceInput.focus();
      replaceInput.select();
    },
    closeReplaceIfOpen() {
      if (replaceBar.hidden) return false;
      replaceBar.hidden = true;
      input.focus();
      return true;
    },
  };
}
