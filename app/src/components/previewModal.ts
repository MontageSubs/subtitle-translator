import { t } from "../i18n";
import { buildPath, getRoute } from "../router";
import { CLOSE_ICON } from "../render/icons";
import { evaluateLineMetrics } from "../core/lineMetrics";

export interface PreviewCard {
  id: number;
  start: string;
  end: string;
  source: string;
  target: string;
  missing?: boolean;
  warningReason?: string;
  start_ms?: number;
  end_ms?: number;
  targetLang?: string;
  sceneIndex?: number;
}

export interface PreviewApplyResult {
  rawSrt?: string;
  lastUpdatedLabel?: string;
}

export interface PreviewModalOptions {
  lastUpdatedLabel?: string;
  sceneSeconds?: number;
  onApply?: (edits: Map<number, string>) => PreviewApplyResult | void;
}

export type ErrorCategoryKey = "missing" | "overLength" | "overCps";

export interface CardErrorInfo {
  missing: boolean;
  overLength: boolean;
  overCps: boolean;
  cps: number;
}

type UndoEntry = { id: number; before: string; after: string }[];
export type SearchMode = "highlight" | "filter";

const TARGET_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;

const FILTER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`;

const PREV_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>`;

const NEXT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;

const UNDO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;

const REDO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>`;

const CARD_BASE_HEIGHT = 58;
const CARD_CHARS_PER_LINE = 42;
const CARD_LINE_HEIGHT = 20;
const RENDER_BUFFER_PX = 400;

function parseTimeToMs(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length < 2) return 1000;
  const [ss, ms = "0"] = parts.pop()!.split(/[,.]/);
  const mm = parts.pop() ?? "0";
  const hh = parts.pop() ?? "0";
  return ((Number(hh) * 60 + Number(mm)) * 60 + Number(ss)) * 1000 + Number(ms);
}

function getCardStartMs(card: PreviewCard): number {
  return card.start_ms !== undefined ? card.start_ms : parseTimeToMs(card.start);
}

function getCardEndMs(card: PreviewCard): number {
  return card.end_ms !== undefined ? card.end_ms : parseTimeToMs(card.end);
}

function getCardDurationMs(card: PreviewCard): number {
  const startMs = getCardStartMs(card);
  const endMs = getCardEndMs(card);
  return Math.max(100, endMs - startMs);
}

export function ensureSceneIndexes(cards: PreviewCard[], sceneSeconds = 30): PreviewCard[] {
  if (!cards.length) return cards;
  const sceneMs = Math.max(1000, sceneSeconds * 1000);
  let currentScene = 1;
  let prevEnd = getCardEndMs(cards[0]);

  return cards.map((card, idx) => {
    if (idx > 0) {
      const start = getCardStartMs(card);
      if (start - prevEnd > sceneMs) {
        currentScene++;
      }
      prevEnd = Math.max(prevEnd, getCardEndMs(card));
    }
    return card.sceneIndex !== undefined ? card : { ...card, sceneIndex: currentScene };
  });
}

interface TimeSearchResult {
  isTime: boolean;
  isRange: boolean;
  startMs: number;
  endMs?: number;
}

function parseTimeTokenToMs(token: string): number | null {
  const trimmed = token.trim();
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[,.](\d{1,3}))?$/.exec(trimmed);
  if (timeMatch) {
    const p1 = Number(timeMatch[1]);
    const p2 = Number(timeMatch[2]);
    const p3 = timeMatch[3] !== undefined ? Number(timeMatch[3]) : undefined;
    const ms = Number((timeMatch[4] || "0").padEnd(3, "0").slice(0, 3));
    if (p3 !== undefined) {
      return ((p1 * 60 + p2) * 60 + p3) * 1000 + ms;
    }
    return (p1 * 60 + p2) * 1000 + ms;
  }
  const secMatch = /^(\d+(?:\.\d+)?)s?$/i.exec(trimmed);
  if (secMatch) {
    return Math.round(Number(secMatch[1]) * 1000);
  }
  return null;
}

function parseTimeSearch(query: string): TimeSearchResult | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const rangeParts = trimmed.split(/\s*[-~—–]\s*/);
  if (rangeParts.length === 2) {
    const t1 = parseTimeTokenToMs(rangeParts[0]);
    const t2 = parseTimeTokenToMs(rangeParts[1]);
    if (t1 !== null && t2 !== null) {
      return { isTime: true, isRange: true, startMs: Math.min(t1, t2), endMs: Math.max(t1, t2) };
    }
  }
  const t = parseTimeTokenToMs(trimmed);
  if (t !== null) {
    return { isTime: true, isRange: false, startMs: t };
  }
  return null;
}

export function evaluateCardError(card: PreviewCard, targetText: string): CardErrorInfo {
  const trimmed = targetText.trim();
  const missing = !trimmed;
  if (missing) {
    return { missing: true, overLength: false, overCps: false, cps: 0 };
  }
  const durationMs = getCardDurationMs(card);
  const metrics = evaluateLineMetrics(targetText, durationMs, card.targetLang);
  return {
    missing: false,
    overLength: metrics.overLength,
    overCps: metrics.overCps,
    cps: metrics.cps,
  };
}

function isCardCategoryActive(err: CardErrorInfo, activeCategories: Set<ErrorCategoryKey>): boolean {
  if (err.missing && activeCategories.has("missing")) return true;
  if (err.overLength && activeCategories.has("overLength")) return true;
  if (err.overCps && activeCategories.has("overCps")) return true;
  return false;
}

function cardClass(err: CardErrorInfo, activeCategories: Set<ErrorCategoryKey>): string {
  if (!isCardCategoryActive(err, activeCategories)) return "";
  if (err.missing && activeCategories.has("missing")) return " preview-card--missing";
  return " preview-card--warning";
}

function reasonOf(err: CardErrorInfo, activeCategories: Set<ErrorCategoryKey>): string {
  if (!isCardCategoryActive(err, activeCategories)) return "";
  const reasons: string[] = [];
  if (err.missing && activeCategories.has("missing")) {
    reasons.push(t("preview.warning.missing"));
  }
  if (err.overLength && activeCategories.has("overLength")) {
    reasons.push(t("preview.warning.overLength"));
  }
  if (err.overCps && activeCategories.has("overCps")) {
    reasons.push(t("preview.warning.overCps", { cps: err.cps.toFixed(1) }));
  }
  return reasons.join(" · ");
}

function estimateCardHeight(card: PreviewCard, target: string, isSceneStart: boolean, hasReason: boolean): number {
  const charsPerLine = window.innerWidth < 640 ? 25 : 42;
  const sourceLines = Math.max(1, Math.ceil((card.source.length || 1) / charsPerLine));
  const targetLines = Math.max(1, Math.ceil((target.length || 1) / charsPerLine));

  let height = 20;
  if (isSceneStart) height += 20;
  height += 20;
  if (hasReason) height += 22;
  height += sourceLines * 18 + 3;
  height += targetLines * 21 + 6;

  return height;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface CardsViewResult {
  matchedCount: number;
  totalCount: number;
  activeIndex: number;
  activeId: number | null;
}

interface CardsView {
  setFilter(query: string, mode: SearchMode): CardsViewResult;
  navigateMatch(direction: "next" | "prev"): CardsViewResult;
  scrollToId(id: number): void;
  refresh(): void;
  getLayoutMetrics(): { offsets: number[]; totalHeight: number };
  getActiveMatchCardId(): number | null;
}

function createCardsView(
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

  function checkIsSceneStart(card: PreviewCard, idx: number, list: PreviewCard[]): boolean {
    if (card.sceneIndex === undefined) return false;
    if (idx === 0) return true;
    return card.sceneIndex !== list[idx - 1].sceneIndex;
  }

  function rebuildLayout(): void {
    offsets = [0];
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const start = checkIsSceneStart(c, i, cards);
      const err = errorMap.get(c.id);
      const hasReason = err ? isCardCategoryActive(err, activeCategories) : false;
      offsets.push(offsets[offsets.length - 1] + estimateCardHeight(c, targetOf(c), start, hasReason));
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

  function highlightText(text: string, needle: string): string {
    const safe = escapeHtml(text);
    if (!needle) return safe;
    const safeNeedle = escapeHtml(needle);
    const regex = new RegExp(safeNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return safe.replace(regex, (m) => `<mark class="preview-search-highlight">${m}</mark>`);
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
      if (isMatched) cardClasses += " preview-card--matched";
      if (isActiveMatch) cardClasses += " preview-card--active-match";
      if (sceneStart) cardClasses += " preview-card--scene-start";

      const targetText = targetOf(c);
      const needle = currentQuery && searchMode === "highlight" && !parseTimeSearch(currentQuery) && !currentQuery.startsWith("#") ? currentQuery.toLowerCase() : "";

      const renderedSrc = needle ? highlightText(c.source, needle) : escapeHtml(c.source);
      const renderedDst = needle ? highlightText(targetText, needle) : escapeHtml(targetText);

      const sceneMarkup = sceneStart
        ? `<div class="preview-card__scene-divider"><span class="preview-card__scene-tag">${t("preview.sceneHeader", { number: c.sceneIndex ?? 1 })}</span></div>`
        : "";

      html += `<div class="${cardClasses}" style="top:${offsets[i]}px">
        ${sceneMarkup}
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
  };
}

export interface PreviewModalHandle {
  close(): void;
}

export function openPreviewModal(rawSrt: string, inputCards: PreviewCard[], options: PreviewModalOptions = {}): PreviewModalHandle {
  const cards = ensureSceneIndexes(inputCards, options.sceneSeconds ?? 30);
  const edits = new Map<number, string>();
  const editingBefore = new Map<number, string>();
  const errorMap = new Map<number, CardErrorInfo>();
  const activeCategories = new Set<ErrorCategoryKey>();

  let undoStack: UndoEntry[] = [];
  let redoStack: UndoEntry[] = [];
  let searchMode: SearchMode = "highlight";

  const route = getRoute();
  const reportHref = buildPath(route.locale, "docs", ["report-issue"]);

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
      <h2 id="preview-modal-title" class="sr-only">${t("preview.button")}</h2>
      <div class="modal__head">
        <div class="modal__tabs">
          <button type="button" class="modal__tab modal__tab--active" data-tab="cards">${t("preview.tabCards")}</button>
          <button type="button" class="modal__tab" data-tab="raw">${t("preview.tabRaw")}</button>
        </div>
        <button type="button" class="icon-btn modal__close" aria-label="${t("preview.close")}">${CLOSE_ICON}</button>
      </div>
      <div class="modal__body">
        <pre class="preview-raw" style="display:none"></pre>
        <div class="preview-cards-pane">
          <div class="preview-toolbar">
            <div class="preview-search-wrap">
              <input type="search" class="preview-search" id="preview-search-input" placeholder="${t("preview.searchPlaceholder")}" />
            </div>
            <div class="preview-search-actions">
              <span class="preview-match-count" id="preview-match-count"></span>
              <button type="button" class="preview-icon-button" id="preview-search-mode" title="${t("preview.searchModeHighlight")}" aria-label="${t("preview.searchModeHighlight")}">${TARGET_ICON}</button>
              <button type="button" class="preview-icon-button" id="preview-prev-match" title="${t("preview.prevMatch")}" aria-label="${t("preview.prevMatch")}" disabled>${PREV_ICON}</button>
              <button type="button" class="preview-icon-button" id="preview-next-match" title="${t("preview.nextMatch")}" aria-label="${t("preview.nextMatch")}" disabled>${NEXT_ICON}</button>
              <button type="button" class="preview-icon-button" id="preview-undo" title="${t("preview.undo")}" aria-label="${t("preview.undo")}" disabled>${UNDO_ICON}</button>
              <button type="button" class="preview-icon-button" id="preview-redo" title="${t("preview.redo")}" aria-label="${t("preview.redo")}" disabled>${REDO_ICON}</button>
              <button type="button" class="text-link" id="preview-toggle-replace">${t("preview.findReplace")}</button>
            </div>
          </div>
          <div class="preview-replace-bar" id="preview-replace-bar" hidden>
            <input type="text" class="preview-search" id="preview-replace-input" placeholder="${t("preview.replacePlaceholder")}" />
            <button type="button" class="secondary" id="preview-replace-one">${t("preview.replaceSingle")}</button>
            <button type="button" class="primary" id="preview-replace-all">${t("preview.replaceAll")}</button>
          </div>
          <div class="preview-error-area" id="preview-error-area" hidden>
            <div class="preview-error-category-buttons" id="preview-error-buttons"></div>
            <div class="preview-error-cue-numbers" id="preview-error-cues" hidden></div>
          </div>
          <div class="preview-cards-container">
            <div class="preview-cards-host"></div>
            <div class="preview-minimap" id="preview-minimap" hidden></div>
          </div>
          <div class="preview-footer">
            <a class="text-link preview-report-link" href="${reportHref}" target="_blank" rel="noopener">${t("preview.reportIssue")}</a>
            <span class="preview-updated-label" id="preview-updated-label">${options.lastUpdatedLabel ?? ""}</span>
            <button type="button" class="primary" id="preview-apply" disabled>${t("preview.apply")}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.body.style.overflow = "hidden";

  const rawPre = backdrop.querySelector<HTMLElement>(".preview-raw")!;
  rawPre.textContent = rawSrt;
  const cardsPane = backdrop.querySelector<HTMLElement>(".preview-cards-pane")!;
  const cardsHost = backdrop.querySelector<HTMLElement>(".preview-cards-host")!;
  const searchInput = backdrop.querySelector<HTMLInputElement>("#preview-search-input")!;
  const matchCount = backdrop.querySelector<HTMLElement>("#preview-match-count")!;
  const searchModeBtn = backdrop.querySelector<HTMLButtonElement>("#preview-search-mode")!;
  const prevMatchBtn = backdrop.querySelector<HTMLButtonElement>("#preview-prev-match")!;
  const nextMatchBtn = backdrop.querySelector<HTMLButtonElement>("#preview-next-match")!;
  const errorArea = backdrop.querySelector<HTMLElement>("#preview-error-area")!;
  const errorButtonsEl = backdrop.querySelector<HTMLElement>("#preview-error-buttons")!;
  const errorCuesEl = backdrop.querySelector<HTMLElement>("#preview-error-cues")!;
  const undoButton = backdrop.querySelector<HTMLButtonElement>("#preview-undo")!;
  const redoButton = backdrop.querySelector<HTMLButtonElement>("#preview-redo")!;
  const applyButton = backdrop.querySelector<HTMLButtonElement>("#preview-apply")!;
  const replaceBar = backdrop.querySelector<HTMLElement>("#preview-replace-bar")!;
  const replaceInput = backdrop.querySelector<HTMLInputElement>("#preview-replace-input")!;
  const replaceOneBtn = backdrop.querySelector<HTMLButtonElement>("#preview-replace-one")!;
  const replaceAllBtn = backdrop.querySelector<HTMLButtonElement>("#preview-replace-all")!;
  let dirty = false;

  const view = createCardsView(cardsHost, cards, edits, errorMap, activeCategories);

  function evaluateAllCardErrors(): void {
    errorMap.clear();
    for (const card of cards) {
      const currentTarget = edits.get(card.id) ?? card.target;
      errorMap.set(card.id, evaluateCardError(card, currentTarget));
    }
  }

  function getCategoryCounts(): Record<ErrorCategoryKey, number> {
    const counts: Record<ErrorCategoryKey, number> = { missing: 0, overLength: 0, overCps: 0 };
    for (const err of errorMap.values()) {
      if (err.missing) counts.missing++;
      if (err.overLength) counts.overLength++;
      if (err.overCps) counts.overCps++;
    }
    return counts;
  }

  const minimapEl = backdrop.querySelector<HTMLElement>("#preview-minimap")!;

  function renderErrorArea(): void {
    evaluateAllCardErrors();
    const counts = getCategoryCounts();

    for (const key of Array.from(activeCategories)) {
      if (counts[key] === 0) activeCategories.delete(key);
    }

    const totalErrors = counts.missing + counts.overLength + counts.overCps;
    if (totalErrors === 0) {
      errorArea.hidden = true;
      errorCuesEl.hidden = true;
      minimapEl.hidden = true;
      minimapEl.innerHTML = "";
      return;
    }

    errorArea.hidden = false;
    let buttonsHtml = "";

    if (counts.missing > 0) {
      const active = activeCategories.has("missing");
      buttonsHtml += `<button type="button" class="preview-error-category-btn preview-error-category-btn--missing${active ? " preview-error-category-btn--active" : ""}" data-category="missing">
        ✕ ${t("preview.warning.missing")} (${counts.missing})
      </button>`;
    }
    if (counts.overLength > 0) {
      const active = activeCategories.has("overLength");
      buttonsHtml += `<button type="button" class="preview-error-category-btn preview-error-category-btn--warning${active ? " preview-error-category-btn--active" : ""}" data-category="overLength">
        ⚠ ${t("preview.warning.overLength")} (${counts.overLength})
      </button>`;
    }
    if (counts.overCps > 0) {
      const active = activeCategories.has("overCps");
      buttonsHtml += `<button type="button" class="preview-error-category-btn preview-error-category-btn--warning${active ? " preview-error-category-btn--active" : ""}" data-category="overCps">
        ⚠ ${t("preview.warning.overCpsLabel")} (${counts.overCps})
      </button>`;
    }
    errorButtonsEl.innerHTML = buttonsHtml;

    errorButtonsEl.querySelectorAll<HTMLButtonElement>("[data-category]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.dataset.category as ErrorCategoryKey;
        if (activeCategories.has(cat)) activeCategories.delete(cat);
        else activeCategories.add(cat);
        renderErrorArea();
        view.refresh();
      });
    });

    if (activeCategories.size === 0) {
      errorCuesEl.hidden = true;
      errorCuesEl.innerHTML = "";
      minimapEl.hidden = true;
      minimapEl.innerHTML = "";
    } else {
      errorCuesEl.hidden = false;
      minimapEl.hidden = false;
      const chips: string[] = [];
      const markers: string[] = [];
      const { offsets, totalHeight } = view.getLayoutMetrics();

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const err = errorMap.get(card.id)!;
        if (isCardCategoryActive(err, activeCategories)) {
          chips.push(`<button type="button" class="preview-problem-chip${err.missing ? " preview-problem-chip--missing" : ""}" data-jump="${card.id}">#${card.id}</button>`);

          const topPx = offsets[i] || 0;
          const heightPx = (offsets[i + 1] || topPx + 60) - topPx;
          const topPct = (topPx / totalHeight) * 100;
          const heightPct = Math.max(0.6, (heightPx / totalHeight) * 100);
          const isMissing = err.missing && activeCategories.has("missing");
          const markerClass = isMissing ? "preview-minimap__marker--missing" : "preview-minimap__marker--warning";

          markers.push(`<div class="preview-minimap__marker ${markerClass}" style="top:${topPct.toFixed(2)}%;height:${heightPct.toFixed(2)}%;" title="#${card.id}" data-jump="${card.id}"></div>`);
        }
      }
      errorCuesEl.innerHTML = chips.join("");
      minimapEl.innerHTML = markers.join("");

      const bindJumps = (container: HTMLElement) => {
        container.querySelectorAll<HTMLElement>("[data-jump]").forEach((el) => {
          el.addEventListener("click", () => {
            searchInput.value = "";
            updateSearchUI();
            view.scrollToId(Number(el.dataset.jump));
          });
        });
      };
      bindJumps(errorCuesEl);
      bindJumps(minimapEl);
    }
  }

  renderErrorArea();

  function markDirty(): void {
    dirty = true;
    applyButton.disabled = false;
  }

  function updateUndoRedoButtons(): void {
    undoButton.disabled = undoStack.length === 0;
    redoButton.disabled = redoStack.length === 0;
  }

  function applyEntry(entry: UndoEntry, direction: "before" | "after"): void {
    for (const item of entry) edits.set(item.id, item[direction]);
    renderErrorArea();
    updateSearchUI();
  }

  function pushUndo(entry: UndoEntry): void {
    undoStack.push(entry);
    redoStack = [];
    updateUndoRedoButtons();
    markDirty();
  }

  function undo(): void {
    const entry = undoStack.pop();
    if (!entry) return;
    applyEntry(entry, "before");
    redoStack.push(entry);
    updateUndoRedoButtons();
    markDirty();
  }

  function redo(): void {
    const entry = redoStack.pop();
    if (!entry) return;
    applyEntry(entry, "after");
    undoStack.push(entry);
    updateUndoRedoButtons();
    markDirty();
  }

  function updateSearchUI(): void {
    const res = view.setFilter(searchInput.value, searchMode);
    prevMatchBtn.disabled = res.matchedCount === 0;
    nextMatchBtn.disabled = res.matchedCount === 0;

    if (!searchInput.value.trim()) {
      matchCount.textContent = "";
    } else if (searchMode === "highlight" && res.matchedCount > 0) {
      matchCount.textContent = t("preview.matchCountHighlight", {
        current: res.activeIndex >= 0 ? res.activeIndex + 1 : 0,
        matched: res.matchedCount,
        total: res.totalCount,
      });
    } else {
      matchCount.textContent = t("preview.matchCount", { matched: res.matchedCount, total: res.totalCount });
    }
  }

  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);

  searchModeBtn.addEventListener("click", () => {
    searchMode = searchMode === "highlight" ? "filter" : "highlight";
    searchModeBtn.innerHTML = searchMode === "highlight" ? TARGET_ICON : FILTER_ICON;
    const modeLabel = searchMode === "highlight" ? t("preview.searchModeHighlight") : t("preview.searchModeFilter");
    searchModeBtn.title = modeLabel;
    searchModeBtn.setAttribute("aria-label", modeLabel);
    updateSearchUI();
  });

  prevMatchBtn.addEventListener("click", () => {
    const res = view.navigateMatch("prev");
    if (res.matchedCount > 0) {
      if (searchMode === "highlight") {
        matchCount.textContent = t("preview.matchCountHighlight", {
          current: res.activeIndex + 1,
          matched: res.matchedCount,
          total: res.totalCount,
        });
      }
    }
  });

  nextMatchBtn.addEventListener("click", () => {
    const res = view.navigateMatch("next");
    if (res.matchedCount > 0) {
      if (searchMode === "highlight") {
        matchCount.textContent = t("preview.matchCountHighlight", {
          current: res.activeIndex + 1,
          matched: res.matchedCount,
          total: res.totalCount,
        });
      }
    }
  });

  backdrop.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    const isEditable = target.closest("[data-editable]");
    const keyLower = e.key.toLowerCase();
    const isCmdCtrl = e.ctrlKey || e.metaKey;

    if (isCmdCtrl && keyLower === "z") {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (isCmdCtrl && keyLower === "y") {
      e.preventDefault();
      redo();
      return;
    }

    if (target === searchInput || isEditable) {
      if (e.key === "Enter") {
        e.preventDefault();
        const res = view.navigateMatch(e.shiftKey ? "prev" : "next");
        if (res.matchedCount > 0 && searchMode === "highlight") {
          matchCount.textContent = t("preview.matchCountHighlight", {
            current: res.activeIndex + 1,
            matched: res.matchedCount,
            total: res.totalCount,
          });
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const res = view.navigateMatch("next");
        if (res.matchedCount > 0 && searchMode === "highlight") {
          matchCount.textContent = t("preview.matchCountHighlight", {
            current: res.activeIndex + 1,
            matched: res.matchedCount,
            total: res.totalCount,
          });
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const res = view.navigateMatch("prev");
        if (res.matchedCount > 0 && searchMode === "highlight") {
          matchCount.textContent = t("preview.matchCountHighlight", {
            current: res.activeIndex + 1,
            matched: res.matchedCount,
            total: res.totalCount,
          });
        }
        return;
      }
    }
  });

  cardsHost.addEventListener("focusin", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-editable]");
    if (!el) return;
    const id = Number(el.dataset.editable);
    editingBefore.set(id, edits.get(id) ?? cards.find((c) => c.id === id)!.target);
  });
  cardsHost.addEventListener("input", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-editable]");
    if (!el) return;
    const id = Number(el.dataset.editable);
    edits.set(id, el.textContent || "");
    renderErrorArea();
  });
  cardsHost.addEventListener("focusout", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-editable]");
    if (!el) return;
    const id = Number(el.dataset.editable);
    const before = editingBefore.get(id);
    editingBefore.delete(id);
    if (before === undefined) return;
    const after = edits.has(id) ? edits.get(id)! : before;
    if (before === after) return;
    pushUndo([{ id, before, after }]);
    view.refresh();
  });

  backdrop.querySelector("#preview-toggle-replace")!.addEventListener("click", () => {
    replaceBar.hidden = !replaceBar.hidden;
    if (!replaceBar.hidden) replaceInput.focus();
  });

  replaceOneBtn.addEventListener("click", () => {
    const query = searchInput.value;
    if (!query) return;
    const activeId = view.getActiveMatchCardId();
    const targetCard = activeId !== null ? cards.find((c) => c.id === activeId) : cards.find((c) => (edits.get(c.id) ?? c.target).includes(query));
    if (!targetCard) return;

    const current = edits.get(targetCard.id) ?? targetCard.target;
    if (!current.includes(query)) return;
    const next = current.replace(query, replaceInput.value);
    edits.set(targetCard.id, next);
    pushUndo([{ id: targetCard.id, before: current, after: next }]);
    renderErrorArea();
    updateSearchUI();
  });

  replaceAllBtn.addEventListener("click", () => {
    const query = searchInput.value;
    if (!query) return;
    const changed: UndoEntry = [];
    for (const card of cards) {
      const current = edits.get(card.id) ?? card.target;
      if (!current.includes(query)) continue;
      const next = current.split(query).join(replaceInput.value);
      if (next === current) continue;
      changed.push({ id: card.id, before: current, after: next });
      edits.set(card.id, next);
    }
    if (changed.length) pushUndo(changed);
    renderErrorArea();
    updateSearchUI();
  });

  searchInput.addEventListener("input", updateSearchUI);

  const updatedLabelEl = backdrop.querySelector<HTMLElement>("#preview-updated-label")!;

  function commit(): void {
    const result = options.onApply?.(new Map(edits));
    if (result?.rawSrt !== undefined) rawPre.textContent = result.rawSrt;
    if (result?.lastUpdatedLabel !== undefined) updatedLabelEl.textContent = result.lastUpdatedLabel;
  }

  applyButton.addEventListener("click", () => {
    if (!dirty) return;
    commit();
    dirty = false;
    applyButton.disabled = true;
  });

  function close() {
    document.body.style.overflow = "";
    backdrop.remove();
  }

  backdrop.querySelector(".modal__close")!.addEventListener("click", close);
  backdrop.querySelector(".preview-report-link")!.addEventListener("click", (e) => {
    if (!dirty) {
      e.preventDefault();
      close();
      window.location.href = reportHref;
    }
  });
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  backdrop.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';
  backdrop.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const focusable = Array.from(backdrop.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  backdrop.querySelector<HTMLButtonElement>(".modal__tab")!.focus();

  backdrop.querySelectorAll<HTMLButtonElement>(".modal__tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      backdrop.querySelectorAll(".modal__tab").forEach((el) => el.classList.remove("modal__tab--active"));
      tab.classList.add("modal__tab--active");
      const isCards = tab.dataset.tab === "cards";
      rawPre.style.display = isCards ? "none" : "block";
      cardsPane.style.display = isCards ? "flex" : "none";
    });
  });

  updateSearchUI();

  return { close };
}
