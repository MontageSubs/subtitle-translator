import { t } from "../i18n";
import { PreviewCard, CardErrorInfo, ErrorCategoryKey, SearchMode, CardsViewResult, CardsView } from "../types/preview";
import {
  checkIsSceneStart,
  estimateCardHeight,
  isCardCategoryActive,
  cardClass,
  reasonOf,
  escapeHtml,
  highlightText,
  parseTimeSearch,
  getCardStartMs,
  getCardEndMs,
} from '../lib/subtitle/previewMetrics';

const RENDER_BUFFER_PX = 400;

export function createCardsView(
  scrollHost: HTMLElement,
  allCards: PreviewCard[],
  edits: Map<number, string>,
  errorMap: Map<number, CardErrorInfo>,
  activeCategories: Set<ErrorCategoryKey>
): CardsView {
  let cards = allCards;
  let offsets: number[] = [0];
  let spacer: HTMLElement;

  let currentQuery = "";
  let searchMode: SearchMode = "highlight";
  let matchedIds: number[] = [];
  let currentMatchIndex = -1;

  function targetOf(card: PreviewCard): string {
    return edits.get(card.id) ?? card.target;
  }

  function rebuildLayout(): void {
    offsets = [0];
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const start = checkIsSceneStart(c, i, cards);
      const err = errorMap.get(c.id);
      const hasReason = err ? isCardCategoryActive(err, activeCategories) : false;
      const cardH = estimateCardHeight(c, targetOf(c), hasReason);
      offsets.push(offsets[offsets.length - 1] + cardH + (start ? 30 : 0));
    }
    scrollHost.innerHTML = `<div class="preview-cards"><div class="preview-cards__spacer" style="height:${offsets[offsets.length - 1]}px"></div></div>`;
    spacer = scrollHost.querySelector<HTMLElement>(".preview-cards__spacer")!;
  }

  function findIndexAtOffset(target: number): number {
    let lo = 0, hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1] < target) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  function renderWindow(): void {
    const viewTop = scrollHost.scrollTop - RENDER_BUFFER_PX;
    const viewBottom = scrollHost.scrollTop + scrollHost.clientHeight + RENDER_BUFFER_PX;
    const startIndex = findIndexAtOffset(Math.max(0, viewTop));
    const endIndex = Math.min(cards.length, findIndexAtOffset(viewBottom) + 1);

    const activeId = currentMatchIndex >= 0 && currentMatchIndex < matchedIds.length ? matchedIds[currentMatchIndex] : null;

    let html = "";
    for (let i = startIndex; i < endIndex; i++) {
      const c = cards[i];
      const err = errorMap.get(c.id) || { missing: false, overLength: false, overCps: false, cps: 0 };
      const reason = reasonOf(err, activeCategories);
      const isMissingActive = err.missing && activeCategories.has("missing");
      const sceneStart = checkIsSceneStart(c, i, cards);

      const isMatched = searchMode === "highlight" && matchedIds.includes(c.id);
      const isActiveMatch = c.id === activeId;

      let cardClasses = "preview-card" + cardClass(err, activeCategories);
      if (edits.has(c.id)) cardClasses += " preview-card--edited";
      if (isMatched) cardClasses += " preview-card--matched";
      if (isActiveMatch) cardClasses += " preview-card--active-match";

      const targetText = targetOf(c);
      const needle = currentQuery && searchMode === "highlight" && !parseTimeSearch(currentQuery) && !currentQuery.startsWith("#") ? currentQuery.toLowerCase() : "";

      const renderedSrc = needle ? highlightText(c.source, needle) : escapeHtml(c.source);
      const renderedDst = needle ? highlightText(targetText, needle) : escapeHtml(targetText);

      let currentTop = offsets[i];
      if (sceneStart) {
        html += `<div class="preview-card__scene-divider" style="top:${currentTop + 15}px;"><span class="preview-card__scene-tag">${t("preview.sceneHeader", { number: c.sceneIndex ?? 1 })}</span></div>`;
        currentTop += 30;
      }

      html += `<div class="${cardClasses}" style="top:${currentTop}px">
        <div class="preview-card__id">#${c.id} · ${c.start} → ${c.end}</div>
        ${reason ? `<div class="preview-card__reason">${isMissingActive ? "✕" : "⚠"} ${escapeHtml(reason)}</div>` : ""}
        <div class="preview-card__src">${renderedSrc}</div>
        <div class="preview-card__dst" contenteditable="true" data-editable="${c.id}">${renderedDst}</div>
      </div>`;
    }
    spacer.innerHTML = html;
  }

  rebuildLayout();
  scrollHost.addEventListener("scroll", renderWindow, { passive: true });
  renderWindow();

  function scrollIdIntoView(id: number) {
    const index = cards.findIndex((c) => c.id === id);
    if (index === -1) return;
    const top = offsets[index] || 0;
    scrollHost.scrollTop = Math.max(0, top - 40);
  }

  return {
    setFilter(query: string, mode: SearchMode): CardsViewResult {
      currentQuery = query.trim();
      searchMode = mode;

      if (!currentQuery) {
        matchedIds = [];
        currentMatchIndex = -1;
        if (mode === "filter" && activeCategories.size > 0) {
          cards = allCards.filter((c) => {
            const err = errorMap.get(c.id);
            return err ? isCardCategoryActive(err, activeCategories) : false;
          });
        } else {
          cards = allCards;
        }
      } else {
        const timeRes = parseTimeSearch(currentQuery);
        const idMatch = /^#(\d+)$/.exec(currentQuery);

        if (timeRes) {
          if (timeRes.isRange) {
            matchedIds = allCards
              .filter((c) => {
                const s = getCardStartMs(c);
                const e = getCardEndMs(c);
                return s <= timeRes.endMs! && e >= timeRes.startMs;
              })
              .map((c) => c.id);
            if (!matchedIds.length) {
              let closest = allCards[0];
              let minDiff = Math.abs(getCardStartMs(closest) - timeRes.startMs);
              for (const c of allCards) {
                const diff = Math.abs(getCardStartMs(c) - timeRes.startMs);
                if (diff < minDiff) {
                  minDiff = diff;
                  closest = c;
                }
              }
              if (closest) matchedIds = [closest.id];
            }
          } else {
            const targetMs = timeRes.startMs;
            let targetCard = allCards.find((c) => getCardStartMs(c) <= targetMs && targetMs <= getCardEndMs(c));
            if (!targetCard) {
              let minDiff = Infinity;
              for (const c of allCards) {
                const diff = Math.abs(getCardStartMs(c) - targetMs);
                if (diff < minDiff) {
                  minDiff = diff;
                  targetCard = c;
                }
              }
            }
            const maxEnd = getCardEndMs(allCards[allCards.length - 1]);
            if (targetMs >= maxEnd && allCards.length) {
              targetCard = allCards[allCards.length - 1];
            }
            matchedIds = targetCard ? [targetCard.id] : [];
          }
        } else if (idMatch) {
          matchedIds = allCards.filter((c) => c.id === Number(idMatch[1])).map((c) => c.id);
        } else {
          const needle = currentQuery.toLowerCase();
          matchedIds = allCards
            .filter((c) => c.source.toLowerCase().includes(needle) || targetOf(c).toLowerCase().includes(needle))
            .map((c) => c.id);
        }

        if (searchMode === "filter") {
          const matchedSet = new Set(matchedIds);
          cards = allCards.filter((c) => matchedSet.has(c.id));
        } else {
          cards = allCards;
        }

        if (matchedIds.length > 0) {
          currentMatchIndex = 0;
          scrollIdIntoView(matchedIds[0]);
        } else {
          currentMatchIndex = -1;
        }
      }

      rebuildLayout();
      renderWindow();
      return {
        matchedCount: matchedIds.length,
        totalCount: allCards.length,
        activeIndex: currentMatchIndex,
        activeId: currentMatchIndex >= 0 ? matchedIds[currentMatchIndex] : null,
      };
    },

    navigateMatch(direction: "next" | "prev"): CardsViewResult {
      if (!matchedIds.length) {
        return { matchedCount: 0, totalCount: allCards.length, activeIndex: -1, activeId: null };
      }
      if (direction === "next") {
        currentMatchIndex = (currentMatchIndex + 1) % matchedIds.length;
      } else {
        currentMatchIndex = (currentMatchIndex - 1 + matchedIds.length) % matchedIds.length;
      }
      const activeId = matchedIds[currentMatchIndex];
      scrollIdIntoView(activeId);
      renderWindow();
      return {
        matchedCount: matchedIds.length,
        totalCount: allCards.length,
        activeIndex: currentMatchIndex,
        activeId,
      };
    },

    scrollToId(id: number): void {
      if (!cards.some((c) => c.id === id)) {
        cards = allCards;
        rebuildLayout();
        renderWindow();
      }
      scrollIdIntoView(id);
    },

    refresh(): void {
      rebuildLayout();
      renderWindow();
    },

    getLayoutMetrics(): { offsets: number[]; totalHeight: number } {
      return { offsets, totalHeight: offsets[offsets.length - 1] || 1 };
    },

    getActiveMatchCardId(): number | null {
      return currentMatchIndex >= 0 && currentMatchIndex < matchedIds.length ? matchedIds[currentMatchIndex] : null;
    },
    getMatchedIds(): number[] {
      return matchedIds;
    },
  };
}
