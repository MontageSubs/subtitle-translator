import { AnCornerOrDefault } from "../../../lib/subtitle/formats/topAlign";
import { MIN_CARD_HEIGHT, estimateCardHeight } from "../metrics/cardHeight";
import { NO_ERROR, cardStateClass, describeReasons, isCategoryActive, isSevere, isSoftWarning } from "../metrics/cardErrors";
import { isSceneStart } from "../metrics/sceneIndex";
import { CardErrorInfo, CardsView, CardsViewResult, ErrorCategoryKey, PreviewCard, SearchMode } from "../types";
import type { EditModel } from "../modal/editModel";
import { renderCard, renderSceneDivider } from "./cardMarkup";
import { SCENE_DIVIDER_HEIGHT, createCardLayout } from "./layout";
import { findMatchedIds, isPlainTextQuery } from "./query";

const RENDER_BUFFER_PX = 400;
const SCENE_DIVIDER_CENTER = SCENE_DIVIDER_HEIGHT / 2;
const SCROLL_MARGIN_PX = 40;

export interface CardsViewState {
  editor: Pick<EditModel, "targetOf" | "isEdited">;
  errorMap: Map<number, CardErrorInfo>;
  activeCategories: Set<ErrorCategoryKey>;
  positionEdits: Map<number, AnCornerOrDefault>;
  selectedForBatch: Set<number>;
  softWarningMode: boolean;
}

export function createCardsView(scrollHost: HTMLElement, allCards: PreviewCard[], state: CardsViewState): CardsView {
  const { editor, errorMap, activeCategories, positionEdits, selectedForBatch, softWarningMode } = state;
  const layout = createCardLayout();
  let cards = allCards;
  let spacer!: HTMLElement;
  let query = "";
  let searchMode: SearchMode = "highlight";
  let matchedIds: number[] = [];
  let matchIndex = -1;

  const targetOf = editor.targetOf;
  const positionOf = (card: PreviewCard): AnCornerOrDefault => positionEdits.get(card.id) ?? card.topAlignAn ?? 2;
  const errorOf = (card: PreviewCard) => errorMap.get(card.id) ?? NO_ERROR;
  const activeMatchId = () => (matchIndex >= 0 && matchIndex < matchedIds.length ? matchedIds[matchIndex] : null);

  function rebuildLayout(): void {
    const heights = cards.map((card) => estimateCardHeight(card, targetOf(card), isCategoryActive(errorOf(card), activeCategories)));
    layout.rebuild(heights, cards.map((card, index) => isSceneStart(card, index, cards)));
    scrollHost.innerHTML = `<div class="preview-cards"><div class="preview-cards__spacer" style="height:${layout.totalHeight}px"></div></div>`;
    spacer = scrollHost.querySelector<HTMLElement>(".preview-cards__spacer")!;
  }

  function cardClasses(card: PreviewCard, error: CardErrorInfo): string {
    const soft = isSoftWarning(error, activeCategories, softWarningMode);
    return [
      "preview-card" + cardStateClass(error, activeCategories, soft),
      editor.isEdited(card.id) && "preview-card--edited",
      searchMode === "highlight" && matchedIds.includes(card.id) && "preview-card--matched",
      card.id === activeMatchId() && "preview-card--active-match",
      selectedForBatch.has(card.id) && "preview-card--pos-selected",
    ].filter(Boolean).join(" ");
  }

  function renderWindow(): void {
    const viewTop = scrollHost.scrollTop - RENDER_BUFFER_PX;
    const viewBottom = scrollHost.scrollTop + scrollHost.clientHeight + RENDER_BUFFER_PX;
    const first = layout.indexAt(Math.max(0, viewTop));
    const last = Math.min(cards.length, layout.indexAt(viewBottom) + 1);
    const needle = searchMode === "highlight" && isPlainTextQuery(query) ? query.toLowerCase() : "";

    let html = "";
    for (let i = first; i < last; i++) {
      const card = cards[i];
      const error = errorOf(card);
      const sceneStart = isSceneStart(card, i, cards);
      if (sceneStart) html += renderSceneDivider(layout.offsets[i] + SCENE_DIVIDER_CENTER, card.sceneIndex ?? 1);
      html += renderCard({
        card,
        target: targetOf(card),
        classes: cardClasses(card, error),
        top: layout.cardTop(i, sceneStart),
        height: layout.cardHeight(i, sceneStart),
        reason: describeReasons(error, activeCategories),
        severeReason: isSevere(error, activeCategories),
        position: positionOf(card),
        needle,
      });
    }
    spacer.innerHTML = html;
  }

  function relayout(): void {
    rebuildLayout();
    renderWindow();
  }

  function scrollIdIntoView(id: number): void {
    const index = cards.findIndex((card) => card.id === id);
    if (index !== -1) scrollHost.scrollTop = Math.max(0, (layout.offsets[index] || 0) - SCROLL_MARGIN_PX);
  }

  function result(): CardsViewResult {
    return { matchedCount: matchedIds.length, totalCount: allCards.length, activeIndex: matchIndex, activeId: activeMatchId() };
  }

  function visibleCards(): PreviewCard[] {
    if (!query) {
      return searchMode === "filter" && activeCategories.size > 0
        ? allCards.filter((card) => isCategoryActive(errorOf(card), activeCategories))
        : allCards;
    }
    if (searchMode !== "filter") return allCards;
    const matched = new Set(matchedIds);
    return allCards.filter((card) => matched.has(card.id));
  }

  function shiftFollowingElements(afterTop: number, delta: number): void {
    for (const child of Array.from(spacer.children) as HTMLElement[]) {
      const top = parseFloat(child.style.top) || 0;
      if (top > afterTop) child.style.top = `${top + delta}px`;
    }
  }

  scrollHost.addEventListener("scroll", renderWindow, { passive: true });
  relayout();

  return {
    setFilter(nextQuery, mode) {
      query = nextQuery.trim();
      searchMode = mode;
      matchedIds = query ? findMatchedIds(query, allCards, targetOf) : [];
      matchIndex = matchedIds.length ? 0 : -1;
      cards = visibleCards();
      relayout();
      if (matchIndex === 0) scrollIdIntoView(matchedIds[0]);
      return result();
    },

    navigateMatch(direction) {
      if (!matchedIds.length) return result();
      const step = direction === "next" ? 1 : -1;
      matchIndex = (matchIndex + step + matchedIds.length) % matchedIds.length;
      scrollIdIntoView(matchedIds[matchIndex]);
      renderWindow();
      return result();
    },

    scrollToId(id) {
      if (!cards.some((card) => card.id === id)) {
        cards = allCards;
        relayout();
      }
      scrollIdIntoView(id);
    },

    refresh: relayout,

    adjustCardHeight(id) {
      const index = cards.findIndex((card) => card.id === id);
      if (index === -1 || index >= layout.offsets.length - 1) return;
      const card = cards[index];
      const sceneStart = isSceneStart(card, index, cards);
      const previousHeight = layout.cardHeight(index, sceneStart);
      const estimated = estimateCardHeight(card, targetOf(card), isCategoryActive(errorOf(card), activeCategories));

      const element = spacer.querySelector<HTMLElement>(`.preview-card[data-card-id="${id}"]`);
      let nextHeight = estimated;
      if (element) {
        element.style.height = "auto";
        nextHeight = Math.max(MIN_CARD_HEIGHT, estimated, Math.ceil(element.getBoundingClientRect().height));
        element.style.height = `${nextHeight}px`;
      }

      const delta = nextHeight - previousHeight;
      if (delta === 0) return;
      const top = layout.cardTop(index, sceneStart);
      layout.grow(index, delta);
      spacer.style.height = `${layout.totalHeight}px`;
      shiftFollowingElements(top, delta);
    },

    getLayoutMetrics: () => ({ offsets: layout.offsets, totalHeight: layout.totalHeight }),
    getActiveMatchCardId: activeMatchId,
    getMatchedIds: () => matchedIds,
    getDisplayedCards: () => cards,
  };
}
