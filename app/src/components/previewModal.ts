import { t } from "../i18n";
import { buildPath, getRoute, navigate } from "../router";
import { CLOSE_ICON } from "../render/icons";
import { DictionaryEntry } from "../core/dictionary";
import { mountGlossaryEditor } from "./glossaryEditor";
import { CONTEXT_MAX_CHARS } from "../core/context";
import {
  PreviewCard,
  PreviewApplyResult,
  PreviewModalOptions,
  ErrorCategoryKey,
  CardErrorInfo,
  UndoEntry,
  SearchMode,
  PreviewModalHandle,
} from "../types/preview";
import {
  ensureSceneIndexes,
  evaluateCardError,
  isCardCategoryActive,
} from "../core/previewMetrics";
import { createCardsView } from "./previewVirtualList";

export type { PreviewCard, PreviewApplyResult, PreviewModalOptions, ErrorCategoryKey, CardErrorInfo, PreviewModalHandle };

const TARGET_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
const FILTER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`;
const PREV_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>`;
const NEXT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
const UNDO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;
const REDO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>`;

export function openPreviewModal(
  rawTargetSrt: string,
  rawSourceSrt: string,
  inputCards: PreviewCard[],
  options: PreviewModalOptions = {}
): PreviewModalHandle {
  const cards = ensureSceneIndexes(inputCards, options.sceneSeconds ?? 30);
  const edits = new Map<number, string>();
  const editingBefore = new Map<number, string>();
  const errorMap = new Map<number, CardErrorInfo>();
  const activeCategories = new Set<ErrorCategoryKey>();

  let undoStack: UndoEntry[] = [];
  let redoStack: UndoEntry[] = [];
  let searchMode: SearchMode = "highlight";
  let dirty = false;

  const route = getRoute();
  const reportHref = buildPath(route.locale, "docs", ["report-issue"]);

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
      <h2 id="preview-modal-title" class="sr-only">${t("preview.button") || "Preview"}</h2>
      <div class="modal__head">
        <div class="modal__tabs" role="tablist">
          <button type="button" class="modal__tab modal__tab--active" role="tab" aria-selected="true" data-tab="cards">${t("preview.tabEditor") || "Subtitle Editor"}</button>
          <button type="button" class="modal__tab" role="tab" aria-selected="false" data-tab="context">${t("preview.tabContext") || "Context"}</button>
          <button type="button" class="modal__tab" role="tab" aria-selected="false" data-tab="glossary">${t("preview.tabGlossary") || "Glossary"}</button>
          <button type="button" class="modal__tab" role="tab" aria-selected="false" data-tab="raw-source">${t("preview.tabRawSource") || "Raw Source"}</button>
          <button type="button" class="modal__tab" role="tab" aria-selected="false" data-tab="raw-target">${t("preview.tabRawTarget") || "Raw Target"}</button>
        </div>
        <button type="button" class="icon-btn modal__close" aria-label="${t("preview.close")}">${CLOSE_ICON}</button>
      </div>
      <div class="modal__body">
        <div class="preview-context-container" id="preview-context-container" style="display:none; padding: 20px;">
          <label class="field field--context" style="max-width: 800px; margin: 0 auto; display: block;">
            <div class="field__header" style="margin-bottom: 8px;">
              <span>${t("context.label") || "Context"}</span>
            </div>
            <div class="input-with-clear"><textarea id="preview-context-input" rows="8" placeholder="${t("context.placeholder") || ""}"></textarea><button type="button" class="input-clear-btn" id="preview-context-clear" aria-label="Clear">${CLOSE_ICON}</button></div>
            <span class="field__counter" id="preview-context-counter" style="display: block; text-align: right; font-size: 0.8rem; color: var(--muted); margin-top: 4px;"></span>
          </label>
        </div>
        <div class="preview-glossary-container" id="preview-glossary-container" style="display:none; padding: 20px; max-width: 800px; margin: 0 auto;">
          <div id="preview-glossary-editor"></div>
        </div>
        <div class="preview-raw-container" id="preview-raw-source-container" style="display:none">
          <pre class="preview-raw" id="preview-raw-source"></pre>
          <div class="preview-footer">
            <a class="text-link preview-report-link" href="${reportHref}" target="_blank" rel="noopener">${t("preview.reportIssue")}</a>
            <button type="button" class="primary preview-download-btn" data-target="source">${t("preview.download") || "Download"}</button>
          </div>
        </div>
        <div class="preview-raw-container" id="preview-raw-target-container" style="display:none">
          <pre class="preview-raw" id="preview-raw-target"></pre>
          <div class="preview-footer">
            <a class="text-link preview-report-link" href="${reportHref}" target="_blank" rel="noopener">${t("preview.reportIssue")}</a>
            <button type="button" class="primary preview-download-btn" data-target="target">${t("preview.download") || "Download"}</button>
          </div>
        </div>
        <div class="preview-cards-pane" id="preview-cards-container">
          <div class="preview-toolbar">
            <div class="preview-search-wrap">
              <input type="search" class="preview-search" id="preview-search-input" placeholder="${t("preview.searchPlaceholder")}" aria-label="${t("preview.searchPlaceholder")}" />
              <button type="button" class="preview-search-clear icon-btn" id="preview-search-clear" aria-label="${t("preview.clearSearch") || "Clear search"}" hidden>${CLOSE_ICON}</button>
            </div>
            <div class="preview-search-actions">
              <span class="preview-match-count" id="preview-match-count" aria-live="polite"></span>
              <button type="button" class="preview-icon-button" id="preview-search-mode" title="${t("preview.searchModeHighlight")}" aria-label="${t("preview.searchModeHighlight")}">${TARGET_ICON}</button>
              <button type="button" class="preview-icon-button" id="preview-prev-match" title="${t("preview.prevMatch")}" aria-label="${t("preview.prevMatch")}" disabled>${PREV_ICON}</button>
              <button type="button" class="preview-icon-button" id="preview-next-match" title="${t("preview.nextMatch")}" aria-label="${t("preview.nextMatch")}" disabled>${NEXT_ICON}</button>
              <button type="button" class="preview-icon-button" id="preview-undo" title="${t("preview.undo")}" aria-label="${t("preview.undo")}" disabled>${UNDO_ICON}</button>
              <button type="button" class="preview-icon-button" id="preview-redo" title="${t("preview.redo")}" aria-label="${t("preview.redo")}" disabled>${REDO_ICON}</button>
              <button type="button" class="text-link" id="preview-toggle-replace">${t("preview.findReplace")}</button>
            </div>
          </div>
          <div class="preview-replace-bar" id="preview-replace-bar" hidden>
            <input type="text" class="preview-search" id="preview-replace-input" placeholder="${t("preview.replacePlaceholder")}" aria-label="${t("preview.replacePlaceholder")}" />
            <button type="button" class="secondary" id="preview-replace-one">${t("preview.replaceSingle")}</button>
            <button type="button" class="primary" id="preview-replace-all">${t("preview.replaceAll")}</button>
          </div>
          <div class="preview-error-area" id="preview-error-area" hidden>
            <div class="preview-error-category-buttons" id="preview-error-buttons" role="group" aria-label="${t("preview.errorCategories") || "Error categories"}"></div>
            <div class="preview-error-cue-numbers" id="preview-error-cues" hidden></div>
          </div>
          <div class="preview-cards-container">
            <div class="preview-cards-host" tabindex="-1"></div>
            <div class="preview-minimap" id="preview-minimap" hidden aria-hidden="true"></div>
          </div>
          <div class="preview-footer">
            <a class="text-link preview-report-link" href="${reportHref}" target="_blank" rel="noopener">${t("preview.reportIssue")}</a>
            <span class="preview-updated-label" id="preview-updated-label" aria-live="polite">${options.lastUpdatedLabel ?? ""}</span>
            <button type="button" class="primary" id="preview-apply" disabled>${t("preview.apply")}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.body.style.overflow = "hidden";

  const rawSourcePre = backdrop.querySelector<HTMLElement>("#preview-raw-source")!;
  rawSourcePre.textContent = rawSourceSrt;
  const rawTargetPre = backdrop.querySelector<HTMLElement>("#preview-raw-target")!;
  rawTargetPre.textContent = rawTargetSrt;

  const cardsPane = backdrop.querySelector<HTMLElement>("#preview-cards-container")!;
  const rawSourceContainer = backdrop.querySelector<HTMLElement>("#preview-raw-source-container")!;
  const rawTargetContainer = backdrop.querySelector<HTMLElement>("#preview-raw-target-container")!;
  const contextContainer = backdrop.querySelector<HTMLElement>("#preview-context-container")!;
  const glossaryContainer = backdrop.querySelector<HTMLElement>("#preview-glossary-container")!;

  const cardsHost = backdrop.querySelector<HTMLElement>(".preview-cards-host")!;
  const searchInput = backdrop.querySelector<HTMLInputElement>("#preview-search-input")!;
  const searchClearBtn = backdrop.querySelector<HTMLButtonElement>("#preview-search-clear")!;
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
  const updatedLabelEl = backdrop.querySelector<HTMLElement>("#preview-updated-label")!;
  const minimapEl = backdrop.querySelector<HTMLElement>("#preview-minimap")!;

  let currentContext = options.initialContext || "";
  const contextInput = backdrop.querySelector<HTMLTextAreaElement>("#preview-context-input")!;
  const contextClear = backdrop.querySelector<HTMLButtonElement>("#preview-context-clear")!;
  const contextCounter = backdrop.querySelector<HTMLElement>("#preview-context-counter")!;
  contextInput.value = currentContext;

  function updateContextCounter() {
    const length = currentContext.trim().length;
    const overLimit = length > CONTEXT_MAX_CHARS;
    contextCounter.textContent = `${length}/${CONTEXT_MAX_CHARS}`;
    contextCounter.style.color = overLimit ? "var(--danger)" : "var(--muted)";
  }
  updateContextCounter();

  function markDirty(): void {
    dirty = true;
    applyButton.disabled = false;
  }

  contextClear.addEventListener("click", () => {
    currentContext = "";
    contextInput.value = "";
    updateContextCounter();
    markDirty();
    contextInput.focus();
  });

  contextInput.addEventListener("input", () => {
    currentContext = contextInput.value;
    updateContextCounter();
    markDirty();
  });

  const glossaryEditorEl = backdrop.querySelector<HTMLElement>("#preview-glossary-editor")!;
  const glossaryHandle = mountGlossaryEditor(glossaryEditorEl, options.initialGlossary || [], () => {
    markDirty();
  });

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

  function renderMinimap(): void {
    const counts = getCategoryCounts();
    const totalErrors = counts.missing + counts.overLength + counts.overCps;
    const matchedIds = searchMode === "highlight" ? view.getMatchedIds() : [];
    const activeMatchId = view.getActiveMatchCardId();

    if (totalErrors === 0 && matchedIds.length === 0) {
      errorCuesEl.hidden = true;
      minimapEl.hidden = true;
      minimapEl.innerHTML = "";
      return;
    }

    minimapEl.hidden = false;
    errorCuesEl.hidden = activeCategories.size === 0;

    const chips: string[] = [];
    const markers: string[] = [];
    const { offsets, totalHeight } = view.getLayoutMetrics();

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const err = errorMap.get(card.id)!;
      const isErr = isCardCategoryActive(err, activeCategories);
      const isMatch = matchedIds.includes(card.id);

      if (isErr || isMatch) {
        const sceneStart = card.sceneIndex !== undefined && (i === 0 || card.sceneIndex !== cards[i - 1].sceneIndex);
        const cardTop = offsets[i] + (sceneStart ? 30 : 0);
        const cardHeight = (offsets[i + 1] || (offsets[i] + 60)) - cardTop;
        const topPct = (cardTop / totalHeight) * 100;
        const heightPct = Math.max(0.6, (cardHeight / totalHeight) * 100);

        if (isErr) {
          chips.push(`<button type="button" class="preview-problem-chip${err.missing ? " preview-problem-chip--missing" : ""}" data-jump="${card.id}">#${card.id}</button>`);
          const markerClass = (err.missing && activeCategories.has("missing")) ? "preview-minimap__marker--missing" : "preview-minimap__marker--warning";
          markers.push(`<div class="preview-minimap__marker ${markerClass}" style="top:${topPct.toFixed(2)}%;height:${heightPct.toFixed(2)}%;" title="#${card.id}" data-jump="${card.id}"></div>`);
        } else if (isMatch) {
          const isActive = card.id === activeMatchId;
          const markerClass = "preview-minimap__marker--search" + (isActive ? " preview-minimap__marker--active" : "");
          markers.push(`<div class="preview-minimap__marker ${markerClass}" style="top:${topPct.toFixed(2)}%;height:${heightPct.toFixed(2)}%;" title="#${card.id}" data-jump="${card.id}"></div>`);
        }
      }
    }

    errorCuesEl.innerHTML = chips.join("");
    const thumbTop = (cardsHost.scrollTop / totalHeight) * 100;
    const thumbHeight = Math.max(4, (cardsHost.clientHeight / totalHeight) * 100);
    const thumbHtml = `<div class="preview-minimap__thumb" style="top:${thumbTop.toFixed(2)}%;height:${thumbHeight.toFixed(2)}%;"></div>`;
    minimapEl.innerHTML = thumbHtml + markers.join("");

    const bindJumps = (container: HTMLElement) => {
      container.querySelectorAll<HTMLElement>("[data-jump]").forEach((el) => {
        el.addEventListener("click", () => {
          if (!activeCategories.size) { searchInput.value = ""; updateSearchUI(); }
          view.scrollToId(Number(el.dataset.jump));
        });
      });
    };
    bindJumps(errorCuesEl);
    bindJumps(minimapEl);
  }

  function renderErrorArea(): void {
    evaluateAllCardErrors();
    const counts = getCategoryCounts();

    for (const key of Array.from(activeCategories)) {
      if (counts[key] === 0) activeCategories.delete(key);
    }

    const totalErrors = counts.missing + counts.overLength + counts.overCps;
    if (totalErrors === 0) {
      errorArea.hidden = true;
    } else {
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
    }

    renderMinimap();
  }

  renderErrorArea();

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
    searchClearBtn.hidden = searchInput.value.trim().length === 0;

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
    renderMinimap();
  }

  cardsHost.addEventListener("scroll", () => {
    if (!minimapEl.hidden) {
      const { totalHeight } = view.getLayoutMetrics();
      const thumb = minimapEl.querySelector<HTMLElement>(".preview-minimap__thumb");
      if (thumb) {
        const thumbTop = (cardsHost.scrollTop / totalHeight) * 100;
        thumb.style.top = `${thumbTop.toFixed(2)}%`;
      }
    }
  }, { passive: true });

  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    updateSearchUI();
    searchInput.focus();
  });

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
        renderMinimap();
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
        renderMinimap();
      }
    }
  });

  function selectTab(tabId: string): void {
    backdrop.querySelectorAll(".modal__tab").forEach((el) => {
      const isTarget = el.getAttribute("data-tab") === tabId;
      el.classList.toggle("modal__tab--active", isTarget);
      el.setAttribute("aria-selected", String(isTarget));
    });
    rawSourceContainer.style.display = tabId === "raw-source" ? "block" : "none";
    rawTargetContainer.style.display = tabId === "raw-target" ? "block" : "none";
    cardsPane.style.display = tabId === "cards" ? "flex" : "none";
    contextContainer.style.display = tabId === "context" ? "block" : "none";
    glossaryContainer.style.display = tabId === "glossary" ? "block" : "none";
  }

  backdrop.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    const isEditable = target.closest("[data-editable]");
    const keyLower = e.key.toLowerCase();
    const isCmdCtrl = e.ctrlKey || e.metaKey;

    if (isCmdCtrl && keyLower === "f") {
      e.preventDefault();
      selectTab("cards");
      searchInput.focus();
      searchInput.select();
      return;
    }

    if (isCmdCtrl && keyLower === "h") {
      e.preventDefault();
      selectTab("cards");
      replaceBar.hidden = false;
      replaceInput.focus();
      replaceInput.select();
      return;
    }

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

  function commit(): void {
    const result = options.onApply?.(new Map(edits), currentContext, glossaryHandle.getEntries());
    if (result?.rawSrt !== undefined) rawTargetPre.textContent = result.rawSrt;
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

  backdrop.querySelector(".modal__close")?.addEventListener("click", close);

  backdrop.querySelectorAll(".preview-report-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      if (!dirty) {
        e.preventDefault();
        close();
        navigate(reportHref);
      }
    });
  });

  backdrop.querySelectorAll<HTMLButtonElement>(".preview-download-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const isTarget = btn.dataset.target === "target";
      const content = isTarget ? rawTargetSrt : rawSourceSrt;
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = isTarget ? "translated.srt" : "source.srt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  backdrop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!replaceBar.hidden) {
        replaceBar.hidden = true;
        searchInput.focus();
      } else {
        close();
      }
    }
  });

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
      const tabId = tab.dataset.tab;
      if (tabId) selectTab(tabId);
    });
  });

  updateSearchUI();

  return { close };
}
