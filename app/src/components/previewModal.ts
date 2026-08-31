import { t } from "../i18n";
import { buildPath, getRoute, navigate } from '../router/router';
import { CLOSE_ICON } from "../render/icons";
import { DictionaryEntry } from '../utils/dictionary';
import { mountGlossaryEditor } from "./glossaryEditor";
import { CONTEXT_MAX_CHARS } from '../utils/context';
import { openHistoryImportModal } from "./historyImportModal";
import { setPreviewModalDirty } from "../lib/unsavedChanges";
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
} from '../lib/subtitle/previewMetrics';
import { createCardsView } from "./previewVirtualList";

export type { PreviewCard, PreviewApplyResult, PreviewModalOptions, ErrorCategoryKey, CardErrorInfo, PreviewModalHandle };

const PREV_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>`;
const NEXT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
const UNDO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;
const REDO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>`;

let persistentFilterOnly = false;

function alignTexts(source: string, target: string): [string, string] {
  function parseBlocks(text: string) {
    const lines = text.split("\n");
    const blocks: { timeMs: number, lines: string[] }[] = [];
    let currentBlock = { timeMs: -1, lines: [] as string[] };
    blocks.push(currentBlock);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let timeMs = -1;
      const srtVttMatch = line.match(/^(?:(\d{2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->/);
      if (srtVttMatch) {
        const h = srtVttMatch[1] ? parseInt(srtVttMatch[1]) : 0;
        timeMs = h * 3600000 + parseInt(srtVttMatch[2]) * 60000 + parseInt(srtVttMatch[3]) * 1000 + parseInt(srtVttMatch[4]);
      } else {
        const assMatch = line.match(/^Dialogue: [^,]+,(\d{1,2}):(\d{2}):(\d{2})\.(\d{2}),/);
        if (assMatch) {
          timeMs = parseInt(assMatch[1]) * 3600000 + parseInt(assMatch[2]) * 60000 + parseInt(assMatch[3]) * 1000 + parseInt(assMatch[4]) * 10;
        }
      }
      if (timeMs >= 0) {
        const newBlock = { timeMs, lines: [] as string[] };
        if (currentBlock.lines.length > 0 && /^\d+$/.test(currentBlock.lines[currentBlock.lines.length - 1].trim())) {
          newBlock.lines.push(currentBlock.lines.pop()!);
        }
        newBlock.lines.push(line);
        blocks.push(newBlock);
        currentBlock = newBlock;
      } else {
        currentBlock.lines.push(line);
      }
    }
    return blocks;
  }
  const srcBlocks = parseBlocks(source);
  const tgtBlocks = parseBlocks(target);
  let i = 0;
  let j = 0;
  const alignedSrc: string[] = [];
  const alignedTgt: string[] = [];
  while (i < srcBlocks.length || j < tgtBlocks.length) {
    const sBlock = srcBlocks[i];
    const tBlock = tgtBlocks[j];
    if (sBlock && tBlock && sBlock.timeMs === tBlock.timeMs) {
      const sLines = [...sBlock.lines];
      const tLines = [...tBlock.lines];
      const diff = sLines.length - tLines.length;
      if (diff > 0) {
        for(let k = 0; k < diff; k++) tLines.push("");
      } else if (diff < 0) {
        for(let k = 0; k < -diff; k++) sLines.push("");
      }
      alignedSrc.push(...sLines);
      alignedTgt.push(...tLines);
      i++;
      j++;
    } else if (sBlock && tBlock) {
      let foundInTgt = -1;
      for (let k = j + 1; k < tgtBlocks.length; k++) {
        if (tgtBlocks[k].timeMs === sBlock.timeMs) { foundInTgt = k; break; }
      }
      let foundInSrc = -1;
      for (let k = i + 1; k < srcBlocks.length; k++) {
        if (srcBlocks[k].timeMs === tBlock.timeMs) { foundInSrc = k; break; }
      }
      
      if (foundInTgt !== -1 && (foundInSrc === -1 || foundInTgt - j <= foundInSrc - i)) {
        alignedSrc.push(...sBlock.lines);
        for(let k = 0; k < sBlock.lines.length; k++) alignedTgt.push("");
        i++;
      } else if (foundInSrc !== -1) {
        alignedTgt.push(...tBlock.lines);
        for(let k = 0; k < tBlock.lines.length; k++) alignedSrc.push("");
        j++;
      } else {
        const sLines = [...sBlock.lines];
        const tLines = [...tBlock.lines];
        const diff = sLines.length - tLines.length;
        if (diff > 0) {
          for(let k = 0; k < diff; k++) tLines.push("");
        } else if (diff < 0) {
          for(let k = 0; k < -diff; k++) sLines.push("");
        }
        alignedSrc.push(...sLines);
        alignedTgt.push(...tLines);
        i++;
        j++;
      }
    } else if (sBlock) {
      alignedSrc.push(...sBlock.lines);
      for(let k = 0; k < sBlock.lines.length; k++) alignedTgt.push("");
      i++;
    } else if (tBlock) {
      alignedTgt.push(...tBlock.lines);
      for(let k = 0; k < tBlock.lines.length; k++) alignedSrc.push("");
      j++;
    }
  }
  return [alignedSrc.join("\n"), alignedTgt.join("\n")];
}

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
  let searchMode: SearchMode = persistentFilterOnly ? "filter" : "highlight";
  let dirty = false;

  const route = getRoute();
  const reportHref = buildPath(route.locale, "docs", ["report-issue"]);

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal preview-modal-box" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
      <h2 id="preview-modal-title" class="sr-only">${t("preview.button") || "Preview"}</h2>
      <div class="modal__head">
        <div class="modal__tabs" role="tablist">
          <button type="button" class="modal__tab modal__tab--active" role="tab" aria-selected="true" data-tab="cards">${t("preview.tabEditor") || "Subtitle Editor"}</button>
          <button type="button" class="modal__tab" role="tab" aria-selected="false" data-tab="context">${t("preview.tabContext") || "Context"}</button>
          <button type="button" class="modal__tab" role="tab" aria-selected="false" data-tab="glossary">${t("preview.tabGlossary") || "Glossary"}</button>
          <button type="button" class="modal__tab" role="tab" aria-selected="false" data-tab="raw-source">${t("preview.tabRawSource") || "Raw Source"}</button>
          <button type="button" class="modal__tab" role="tab" aria-selected="false" data-tab="raw-target">${t("preview.tabRawTarget") || "Raw Target"}</button>
          <button type="button" class="modal__tab" role="tab" aria-selected="false" data-tab="compare">${t("preview.tabCompare") || "Compare"}</button>
        </div>
        <div class="modal__controls" style="display: flex; gap: 4px; align-items: center;">
          <button type="button" class="icon-btn modal__maximize" aria-label="Maximize">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          </button>
          <button type="button" class="icon-btn modal__close" aria-label="${t("preview.close")}">${CLOSE_ICON}</button>
        </div>
      </div>
      <div class="modal__body">
        <div class="preview-context-container" id="preview-context-container" style="display:none">
          <div class="preview-tab-body" style="padding: 20px; flex: 1; overflow-y: auto; display: flex; flex-direction: column;">
            <div class="field field--context" style="max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; flex: 1; width: 100%;">
              <div class="field__header" style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                <label for="preview-context-input">${t("context.label") || "Context"}</label>
                <button type="button" class="ghost-btn ghost-btn--mini" id="preview-context-history-import">${t("history.import")}</button>
              </div>
              <div class="input-with-clear" style="flex: 1; display: flex;"><textarea id="preview-context-input" style="flex: 1; resize: vertical; min-height: 200px; padding-bottom: 30px;" placeholder="${t("context.placeholder") || ""}"></textarea><button type="button" class="input-clear-btn" id="preview-context-clear" aria-label="Clear">${CLOSE_ICON}</button></div>
              <span class="field__counter" id="preview-context-counter" style="display: block; text-align: right; font-size: 0.8rem; color: var(--muted); margin-top: 4px; flex-shrink: 0;"></span>
            </div>
          </div>
          <div class="preview-footer">
            <a class="text-link preview-report-link" href="${reportHref}" target="_blank" rel="noopener">${t("preview.reportIssue")}</a>
            <button type="button" class="primary preview-apply-btn" id="preview-context-apply" disabled>${t("preview.apply")}</button>
          </div>
        </div>
        <div class="preview-glossary-container" id="preview-glossary-container" style="display:none">
          <div class="preview-tab-body" style="padding: 20px; max-width: 800px; margin: 0 auto; width: 100%; box-sizing: border-box; flex: 1; overflow-y: auto;">
            <div id="preview-glossary-editor"></div>
          </div>
          <div class="preview-footer">
            <a class="text-link preview-report-link" href="${reportHref}" target="_blank" rel="noopener">${t("preview.reportIssue")}</a>
            <button type="button" class="primary preview-apply-btn" id="preview-glossary-apply" disabled>${t("preview.apply")}</button>
          </div>
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
        <div class="preview-compare-container" id="preview-compare-container" style="display:none">
          <div class="preview-compare-panes">
            <div class="preview-compare-pane"><pre class="preview-raw preview-compare-raw" id="preview-compare-source" dir="auto"></pre></div>
            <div class="preview-compare-pane"><pre class="preview-raw preview-compare-raw" id="preview-compare-target" dir="auto"></pre></div>
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
              <label class="preview-filter-label" for="preview-filter-checkbox" title="${t("preview.searchModeFilter")}">
                <input type="checkbox" id="preview-filter-checkbox" name="preview_filter_checkbox" class="preview-filter-checkbox"${persistentFilterOnly ? " checked" : ""} />
                <span>${t("preview.searchModeFilter")}</span>
              </label>
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
  document.body.classList.add("modal-open");
  document.body.style.overflow = "hidden";

  const rawSourcePre = backdrop.querySelector<HTMLElement>("#preview-raw-source")!;
  rawSourcePre.textContent = rawSourceSrt;
  const rawTargetPre = backdrop.querySelector<HTMLElement>("#preview-raw-target")!;
  rawTargetPre.textContent = rawTargetSrt;
  const compareSourcePre = backdrop.querySelector<HTMLElement>("#preview-compare-source")!;
  const compareTargetPre = backdrop.querySelector<HTMLElement>("#preview-compare-target")!;
  const [alignedSrc, alignedTgt] = alignTexts(rawSourceSrt, rawTargetSrt);
  compareSourcePre.textContent = alignedSrc;
  compareTargetPre.textContent = alignedTgt;

  const cardsPane = backdrop.querySelector<HTMLElement>("#preview-cards-container")!;
  const rawSourceContainer = backdrop.querySelector<HTMLElement>("#preview-raw-source-container")!;
  const rawTargetContainer = backdrop.querySelector<HTMLElement>("#preview-raw-target-container")!;
  const compareContainer = backdrop.querySelector<HTMLElement>("#preview-compare-container")!;
  const contextContainer = backdrop.querySelector<HTMLElement>("#preview-context-container")!;
  const glossaryContainer = backdrop.querySelector<HTMLElement>("#preview-glossary-container")!;

  const cardsHost = backdrop.querySelector<HTMLElement>(".preview-cards-host")!;
  const searchInput = backdrop.querySelector<HTMLInputElement>("#preview-search-input")!;
  const searchClearBtn = backdrop.querySelector<HTMLButtonElement>("#preview-search-clear")!;
  const matchCount = backdrop.querySelector<HTMLElement>("#preview-match-count")!;
  const filterCheckbox = backdrop.querySelector<HTMLInputElement>("#preview-filter-checkbox")!;
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

  const allApplyButtons = backdrop.querySelectorAll<HTMLButtonElement>("#preview-apply, .preview-apply-btn");

  function markDirty(): void {
    dirty = true;
    setPreviewModalDirty(true);
    allApplyButtons.forEach((btn) => { btn.disabled = false; });
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

  const previewContextImportBtn = backdrop.querySelector<HTMLButtonElement>("#preview-context-history-import");
  previewContextImportBtn?.addEventListener("click", () => {
    openHistoryImportModal("context", (res) => {
      if (res.contextText) {
        currentContext = res.contextText;
        contextInput.value = currentContext;
        updateContextCounter();
        markDirty();
      }
    });
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
    const counts: Record<ErrorCategoryKey, number> = { missing: 0, overLength: 0, overCps: 0, leaked: 0 };
    for (const err of errorMap.values()) {
      if (err.missing) counts.missing++;
      if (err.leaked) counts.leaked++;
      if (err.overLength) counts.overLength++;
      if (err.overCps) counts.overCps++;
    }
    return counts;
  }

  function renderMinimap(): void {
    const counts = getCategoryCounts();
    const totalErrors = counts.missing + counts.overLength + counts.overCps + counts.leaked;
    const matchedIds = view.getMatchedIds();
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
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const err = errorMap.get(card.id)!;
      if (isCardCategoryActive(err, activeCategories)) {
        const isMissing = (err.missing && activeCategories.has("missing")) || (err.leaked && activeCategories.has("leaked"));
        chips.push(`<button type="button" class="preview-problem-chip${isMissing ? " preview-problem-chip--missing" : ""}" data-jump="${card.id}">#${card.id}</button>`);
      }
    }
    errorCuesEl.innerHTML = chips.join("");

    const displayedCards = view.getDisplayedCards();
    const { offsets, totalHeight } = view.getLayoutMetrics();
    const markers: string[] = [];

    if (totalHeight > 0) {
      if (searchMode === "filter") {
        if (activeMatchId !== null) {
          const activeIndex = displayedCards.findIndex((c) => c.id === activeMatchId);
          if (activeIndex >= 0) {
            const card = displayedCards[activeIndex];
            const sceneStart = card.sceneIndex !== undefined && (activeIndex === 0 || card.sceneIndex !== displayedCards[activeIndex - 1].sceneIndex);
            const cardTop = offsets[activeIndex] + (sceneStart ? 30 : 0);
            const cardHeight = (offsets[activeIndex + 1] || (offsets[activeIndex] + 60)) - cardTop;
            const topPct = (cardTop / totalHeight) * 100;
            const heightPct = Math.max(1.5, (cardHeight / totalHeight) * 100);
            markers.push(`<div class="preview-minimap__marker preview-minimap__marker--search preview-minimap__marker--active" style="top:${topPct.toFixed(2)}%;height:${heightPct.toFixed(2)}%;" title="#${card.id}" data-jump="${card.id}"></div>`);
          }
        }
      } else {
        for (let i = 0; i < displayedCards.length; i++) {
          const card = displayedCards[i];
          const err = errorMap.get(card.id)!;
          const isErr = isCardCategoryActive(err, activeCategories);
          const isMatch = matchedIds.includes(card.id);

          if (isErr || isMatch) {
            const sceneStart = card.sceneIndex !== undefined && (i === 0 || card.sceneIndex !== displayedCards[i - 1].sceneIndex);
            const cardTop = offsets[i] + (sceneStart ? 30 : 0);
            const cardHeight = (offsets[i + 1] || (offsets[i] + 60)) - cardTop;
            const topPct = (cardTop / totalHeight) * 100;
            const heightPct = Math.max(0.6, (cardHeight / totalHeight) * 100);

            if (isErr) {
              const isMissing = (err.missing && activeCategories.has("missing")) || (err.leaked && activeCategories.has("leaked"));
              const markerClass = isMissing ? "preview-minimap__marker--missing" : "preview-minimap__marker--warning";
              markers.push(`<div class="preview-minimap__marker ${markerClass}" style="top:${topPct.toFixed(2)}%;height:${heightPct.toFixed(2)}%;" title="#${card.id}" data-jump="${card.id}"></div>`);
            } else if (isMatch) {
              const isActive = card.id === activeMatchId;
              const markerClass = "preview-minimap__marker--search" + (isActive ? " preview-minimap__marker--active" : "");
              markers.push(`<div class="preview-minimap__marker ${markerClass}" style="top:${topPct.toFixed(2)}%;height:${heightPct.toFixed(2)}%;" title="#${card.id}" data-jump="${card.id}"></div>`);
            }
          }
        }
      }
    }

    minimapEl.innerHTML = markers.join("");
    if (markers.length === 0) {
      minimapEl.hidden = true;
    }

    const bindJumps = (container: HTMLElement) => {
      container.querySelectorAll<HTMLElement>("[data-jump]").forEach((el) => {
        el.addEventListener("click", () => {
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

    const totalErrors = counts.missing + counts.overLength + counts.overCps + counts.leaked;
    if (totalErrors === 0) {
      errorArea.hidden = true;
    } else {
      errorArea.hidden = false;
      let buttonsHtml = "";

      if (counts.missing > 0) {
        const active = activeCategories.has("missing");
        buttonsHtml += `<button type="button" class="preview-error-category-btn preview-error-category-btn--missing${active ? " preview-error-category-btn--active" : ""}" data-category="missing" aria-pressed="${active}">
          ✕ ${t("preview.warning.missing")} (${counts.missing})
        </button>`;
      }
      if (counts.leaked > 0) {
        const active = activeCategories.has("leaked");
        buttonsHtml += `<button type="button" class="preview-error-category-btn preview-error-category-btn--missing${active ? " preview-error-category-btn--active" : ""}" data-category="leaked" aria-pressed="${active}">
          ✕ ${t("preview.warning.leaked") || "Possible translation leak"} (${counts.leaked})
        </button>`;
      }
      if (counts.overLength > 0) {
        const active = activeCategories.has("overLength");
        buttonsHtml += `<button type="button" class="preview-error-category-btn preview-error-category-btn--warning${active ? " preview-error-category-btn--active" : ""}" data-category="overLength" aria-pressed="${active}">
          ⚠ ${t("preview.warning.overLength")} (${counts.overLength})
        </button>`;
      }
      if (counts.overCps > 0) {
        const active = activeCategories.has("overCps");
        buttonsHtml += `<button type="button" class="preview-error-category-btn preview-error-category-btn--warning${active ? " preview-error-category-btn--active" : ""}" data-category="overCps" aria-pressed="${active}">
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

  function formatMatchCount(matchedCount: number, activeIndex: number, hasQuery: boolean): string {
    if (!hasQuery) return "";
    if (matchedCount === 0) return "0/0";
    const current = activeIndex >= 0 ? activeIndex + 1 : 1;
    return `${current}/${matchedCount}`;
  }

  function updateSearchUI(): void {
    const hasQuery = searchInput.value.trim().length > 0;
    const res = view.setFilter(searchInput.value, searchMode);
    prevMatchBtn.disabled = res.matchedCount <= 1;
    nextMatchBtn.disabled = res.matchedCount <= 1;
    searchClearBtn.hidden = !hasQuery;
    matchCount.textContent = formatMatchCount(res.matchedCount, res.activeIndex, hasQuery);
    renderMinimap();
  }

  searchClearBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
  });

  searchClearBtn.addEventListener("click", (e) => {
    e.preventDefault();
    searchInput.value = "";
    updateSearchUI();
    searchInput.focus();
  });

  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);

  filterCheckbox.addEventListener("change", () => {
    persistentFilterOnly = filterCheckbox.checked;
    searchMode = persistentFilterOnly ? "filter" : "highlight";
    updateSearchUI();
  });

  prevMatchBtn.addEventListener("click", () => {
    const res = view.navigateMatch("prev");
    if (res.matchedCount > 0) {
      matchCount.textContent = formatMatchCount(res.matchedCount, res.activeIndex, true);
      renderMinimap();
    }
  });

  nextMatchBtn.addEventListener("click", () => {
    const res = view.navigateMatch("next");
    if (res.matchedCount > 0) {
      matchCount.textContent = formatMatchCount(res.matchedCount, res.activeIndex, true);
      renderMinimap();
    }
  });

  let hSyncLeft = false;
  let hSyncRight = false;
  let vSyncLeft = false;
  let vSyncRight = false;

  function handleCompareScroll(e: Event) {
    const isSource = e.target === compareSourcePre;
    const source = isSource ? compareSourcePre : compareTargetPre;
    const target = isSource ? compareTargetPre : compareSourcePre;

    if (isSource) {
      if (!hSyncLeft) {
        hSyncRight = true;
        target.scrollLeft = source.scrollLeft;
      }
      hSyncLeft = false;
    } else {
      if (!hSyncRight) {
        hSyncLeft = true;
        target.scrollLeft = source.scrollLeft;
      }
      hSyncRight = false;
    }

    if (isSource) {
      if (!vSyncLeft) {
        vSyncRight = true;
        target.scrollTop = source.scrollTop;
      }
      vSyncLeft = false;
    } else {
      if (!vSyncRight) {
        vSyncLeft = true;
        target.scrollTop = source.scrollTop;
      }
      vSyncRight = false;
    }
  }

  compareSourcePre.addEventListener("scroll", handleCompareScroll, { passive: true });
  compareTargetPre.addEventListener("scroll", handleCompareScroll, { passive: true });

  let activeTab = "cards";

  function selectTab(tabId: string): void {
    activeTab = tabId;
    backdrop.querySelectorAll(".modal__tab").forEach((el) => {
      const isTarget = el.getAttribute("data-tab") === tabId;
      el.classList.toggle("modal__tab--active", isTarget);
      el.setAttribute("aria-selected", String(isTarget));
    });
    rawSourceContainer.style.display = tabId === "raw-source" ? "flex" : "none";
    rawTargetContainer.style.display = tabId === "raw-target" ? "flex" : "none";
    compareContainer.style.display = tabId === "compare" ? "flex" : "none";
    cardsPane.style.display = tabId === "cards" ? "flex" : "none";
    contextContainer.style.display = tabId === "context" ? "flex" : "none";
    glossaryContainer.style.display = tabId === "glossary" ? "flex" : "none";
  }

  backdrop.addEventListener("keydown", (e) => {
    if (activeTab !== "cards") return;

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
        if (res.matchedCount > 0) {
          matchCount.textContent = formatMatchCount(res.matchedCount, res.activeIndex, true);
          renderMinimap();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const res = view.navigateMatch("next");
        if (res.matchedCount > 0) {
          matchCount.textContent = formatMatchCount(res.matchedCount, res.activeIndex, true);
          renderMinimap();
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const res = view.navigateMatch("prev");
        if (res.matchedCount > 0) {
          matchCount.textContent = formatMatchCount(res.matchedCount, res.activeIndex, true);
          renderMinimap();
        }
        return;
      }
    }
  });

  cardsHost.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-editable]");
    if (!el) return;
    if (el.getAttribute("contenteditable") !== "true") {
      el.setAttribute("contenteditable", "true");
      el.focus();
    }
  });

  cardsHost.addEventListener("keydown", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-editable]");
    if (!el) return;
    if (e.key === "Enter" && !e.shiftKey && el.getAttribute("contenteditable") !== "true") {
      e.preventDefault();
      el.setAttribute("contenteditable", "true");
      el.focus();
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

    const cardEl = el.closest<HTMLElement>(".preview-card");
    if (cardEl) {
      const err = errorMap.get(id);
      if (err) {
        const hasMissing = !!(err.missing && activeCategories.has("missing"));
        const hasLeaked = !!(err.leaked && activeCategories.has("leaked"));
        const hasWarning = !!((err.overLength && activeCategories.has("overLength")) || (err.overCps && activeCategories.has("overCps")));
        
        cardEl.classList.toggle("preview-card--missing", hasMissing);
        cardEl.classList.toggle("preview-card--leaked", hasLeaked);
        cardEl.classList.toggle("preview-card--warning", !hasMissing && !hasLeaked && hasWarning);
      }
    }
  });
  cardsHost.addEventListener("focusout", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-editable]");
    if (!el) return;
    el.removeAttribute("contenteditable");
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
  searchInput.addEventListener("search", updateSearchUI);

  function commit(): void {
    const result = options.onApply?.(new Map(edits), currentContext, glossaryHandle.getEntries());
    if (result) {
      if (result.rawSrt !== undefined) {
        rawTargetPre.textContent = result.rawSrt;
        const [alignedSrc, alignedTgt] = alignTexts(rawSourceSrt, result.rawSrt);
        compareSourcePre.textContent = alignedSrc;
        compareTargetPre.textContent = alignedTgt;
        rawTargetSrt = result.rawSrt;
      }
      if (result.lastUpdatedLabel !== undefined) updatedLabelEl.textContent = result.lastUpdatedLabel;
    }
  }

  allApplyButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!dirty) return;
      commit();
      dirty = false;
      setPreviewModalDirty(false);
      allApplyButtons.forEach((b) => { b.disabled = true; });
    });
  });

  function close() {
    setPreviewModalDirty(false);
    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
    const appEl = document.getElementById("app");
    if (appEl) appEl.removeAttribute("inert");
    backdrop.remove();
  }


  const maximizeBtn = backdrop.querySelector(".modal__maximize");
  const modalBox = backdrop.querySelector(".preview-modal-box");
  let isMaximized = false;
  maximizeBtn?.addEventListener("click", () => {
    isMaximized = !isMaximized;
    if (isMaximized) {
      modalBox?.classList.add("is-maximized");
      backdrop.classList.add("is-maximized");
      const appEl = document.getElementById("app");
      if (appEl) appEl.setAttribute("inert", "true");
    } else {
      modalBox?.classList.remove("is-maximized");
      backdrop.classList.remove("is-maximized");
      const appEl = document.getElementById("app");
      if (appEl) appEl.removeAttribute("inert");
    }
  });

  function checkUnsavedAndClose() {
    if (dirty) {
      if (!window.confirm(t("preview.unsavedWarning") || "You have unsaved changes. Are you sure you want to close?")) return;
    }
    close();
  }

  backdrop.querySelector(".modal__close")?.addEventListener("click", checkUnsavedAndClose);

  backdrop.querySelectorAll(".preview-report-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      if (dirty) {
        if (!window.confirm(t("preview.unsavedWarning") || "You have unsaved changes. Are you sure you want to close?")) return;
      }
      close();
      navigate(reportHref);
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
      const filename = isTarget
        ? (options.translatedFilename || "translated.srt")
        : (options.sourceFilename || "source.srt");
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) checkUnsavedAndClose(); });
  backdrop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!replaceBar.hidden) {
        replaceBar.hidden = true;
        searchInput.focus();
      } else {
        checkUnsavedAndClose();
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
