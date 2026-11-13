import { AnCornerOrDefault } from "../../../lib/subtitle/formats/topAlign";
import type { PositionRule } from "../../../lib/subtitle/formats/cueLayout";
import { findCardsByTime, parseTimeSearch } from "../metrics/timeSearch";
import { MIN_CARD_HEIGHT, charsPerLineFor, estimateCardHeight } from "../metrics/cardHeight";
import { NO_ERROR, cardStateClass, describeReasons, isCategoryActive, isSevere, isSoftWarning } from "../metrics/cardErrors";
import { isSceneStart } from "../metrics/sceneIndex";
import { CardErrorInfo, CardsView, CardsViewResult, ErrorCategoryKey, PreviewCard, SearchMode } from "../types";
import type { EditModel } from "../modal/editModel";
import type { Overlay } from "../modal/overlay";
import { renderCard, renderSceneDivider } from "./cardMarkup";
import { SCENE_DIVIDER_HEIGHT, createCardLayout } from "./layout";

const CUE_ID_QUERY_PATTERN = /^#(\d+)$/;

export function isPlainTextQuery(query: string): boolean {
  return Boolean(query) && !parseTimeSearch(query) && !query.startsWith("#");
}

interface LowercasedText {
  raw: string;
  lower: string;
}

const lowercasedSources = new WeakMap<PreviewCard, LowercasedText>();
const lowercasedTargets = new WeakMap<PreviewCard, LowercasedText>();

function lowercased(cache: WeakMap<PreviewCard, LowercasedText>, card: PreviewCard, raw: string): string {
  const cached = cache.get(card);
  if (cached?.raw === raw) return cached.lower;
  const lower = raw.toLowerCase();
  cache.set(card, { raw, lower });
  return lower;
}

export function findMatchedIds(query: string, cards: PreviewCard[], targetOf: (card: PreviewCard) => string): number[] {
  const time = parseTimeSearch(query);
  if (time) return findCardsByTime(cards, time);
  const idMatch = CUE_ID_QUERY_PATTERN.exec(query);
  if (idMatch) return cards.filter((card) => card.id === Number(idMatch[1])).map((card) => card.id);
  const needle = query.toLowerCase();
  const matched: number[] = [];
  for (const card of cards) {
    if (lowercased(lowercasedSources, card, card.source).includes(needle) || lowercased(lowercasedTargets, card, targetOf(card)).includes(needle)) matched.push(card.id);
  }
  return matched;
}

const RENDER_BUFFER_PX = 400;
const SCROLL_MARGIN_PX = 40;

export interface CardsViewState {
  editor: Pick<EditModel, "targetOf" | "isEdited">;
  errorMap: Map<number, CardErrorInfo>;
  activeCategories: Set<ErrorCategoryKey>;
  positions: Pick<Overlay<AnCornerOrDefault>, "valueOf">;
  positionRule: PositionRule;
  selectedForBatch: Set<number>;
  softWarningMode: boolean;
}

export function createCardsView(scrollHost: HTMLElement, allCards: PreviewCard[], state: CardsViewState): CardsView {
  const { editor, errorMap, activeCategories, positions, positionRule, selectedForBatch, softWarningMode } = state;
  const layout = createCardLayout();
  let cards = allCards;
  let spacer!: HTMLElement;
  let query = "";
  let searchMode: SearchMode = "highlight";
  let matchedIds: number[] = [];
  let highlightNeedle = "";
  let matchIndex = -1;
  let layoutWidth = 0;
  let resizeFrame = 0;

  const targetOf = editor.targetOf;
  const positionOf = (card: PreviewCard): AnCornerOrDefault => positions.valueOf(card.id);
  const errorOf = (card: PreviewCard) => errorMap.get(card.id) ?? NO_ERROR;
  const activeMatchId = () => (matchIndex >= 0 && matchIndex < matchedIds.length ? matchedIds[matchIndex] : null);

  function rebuildLayout(): void {
    layoutWidth = scrollHost.clientWidth;
    const charsPerLine = charsPerLineFor(layoutWidth);
    const heights = cards.map((card) => estimateCardHeight(card, targetOf(card), isCategoryActive(errorOf(card), activeCategories), charsPerLine));
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
      card.locked && "preview-card--locked",
    ].filter(Boolean).join(" ");
  }

  function renderWindow(): void {
    const viewTop = scrollHost.scrollTop - RENDER_BUFFER_PX;
    const viewBottom = scrollHost.scrollTop + scrollHost.clientHeight + RENDER_BUFFER_PX;
    const first = layout.indexAt(Math.max(0, viewTop));
    const last = Math.min(cards.length, layout.indexAt(viewBottom) + 1);
    const needle = highlightNeedle;

    let html = "";
    for (let i = first; i < last; i++) {
      const card = cards[i];
      const error = errorOf(card);
      const sceneStart = isSceneStart(card, i, cards);
      if (sceneStart) html += renderSceneDivider(layout.offsets[i], SCENE_DIVIDER_HEIGHT, card.sceneIndex ?? 1);
      html += renderCard({
        card,
        target: targetOf(card),
        classes: cardClasses(card, error),
        top: layout.cardTop(i, sceneStart),
        height: layout.cardHeight(i, sceneStart),
        reason: describeReasons(error, activeCategories),
        severeReason: isSevere(error, activeCategories),
        position: positionOf(card),
        defaultPosition: positionRule.defaultAn,
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

  function preserveAnchor(mutate: () => void): void {
    const hostTop = () => scrollHost.getBoundingClientRect().top;
    const index = cards.length ? layout.indexAt(scrollHost.scrollTop + scrollHost.clientHeight / 2) : -1;
    const anchorId = cards[index]?.id;
    const anchorScreenTop = index >= 0 ? hostTop() + layout.offsets[index] - scrollHost.scrollTop : 0;
    mutate();
    const next = anchorId === undefined ? -1 : cards.findIndex((card) => card.id === anchorId);
    if (next < 0) return;
    scrollHost.scrollTop = Math.max(0, layout.offsets[next] + hostTop() - anchorScreenTop);
    renderWindow();
  }

  function followHostSize(): void {
    resizeFrame = 0;
    if (!scrollHost.isConnected) return resizeObserver.disconnect();
    if (charsPerLineFor(scrollHost.clientWidth) !== charsPerLineFor(layoutWidth)) preserveAnchor(relayout);
    else renderWindow();
  }

  const resizeObserver = new ResizeObserver(() => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(followHostSize);
  });

  scrollHost.addEventListener("scroll", renderWindow, { passive: true });
  relayout();
  resizeObserver.observe(scrollHost);

  return {
    setFilter(nextQuery, mode) {
      query = nextQuery.trim();
      searchMode = mode;
      highlightNeedle = mode === "highlight" && isPlainTextQuery(query) ? query.toLowerCase() : "";
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

    refresh: () => preserveAnchor(relayout),
    preserveAnchor,

    adjustCardHeight(id) {
      const index = cards.findIndex((card) => card.id === id);
      if (index === -1 || index >= layout.offsets.length - 1) return;
      const card = cards[index];
      const sceneStart = isSceneStart(card, index, cards);
      const previousHeight = layout.cardHeight(index, sceneStart);
      const estimated = estimateCardHeight(card, targetOf(card), isCategoryActive(errorOf(card), activeCategories), charsPerLineFor(scrollHost.clientWidth));

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
