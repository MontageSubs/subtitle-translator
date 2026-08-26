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
}

export interface PreviewApplyResult {
  rawSrt?: string;
  lastUpdatedLabel?: string;
}

export interface PreviewModalOptions {
  lastUpdatedLabel?: string;
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

function getCardDurationMs(card: PreviewCard): number {
  if (card.start_ms !== undefined && card.end_ms !== undefined) {
    return Math.max(100, card.end_ms - card.start_ms);
  }
  const startMs = parseTimeToMs(card.start);
  const endMs = parseTimeToMs(card.end);
  return Math.max(100, endMs - startMs);
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

function estimateCardHeight(card: PreviewCard, target: string): number {
  const lines = Math.max(1, Math.ceil((card.source.length || 1) / CARD_CHARS_PER_LINE)) +
    Math.max(1, Math.ceil((target.length || 1) / CARD_CHARS_PER_LINE));
  return CARD_BASE_HEIGHT + lines * CARD_LINE_HEIGHT;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface CardsView {
  setFilter(query: string): number;
  scrollToId(id: number): void;
  refresh(): void;
  getLayoutMetrics(): { offsets: number[]; totalHeight: number };
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

  function targetOf(card: PreviewCard): string {
    return edits.get(card.id) ?? card.target;
  }

  function rebuildLayout(): void {
    offsets = [0];
    for (const card of cards) offsets.push(offsets[offsets.length - 1] + estimateCardHeight(card, targetOf(card)));
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

    let html = "";
    for (let i = startIndex; i < endIndex; i++) {
      const c = cards[i];
      const err = errorMap.get(c.id) || { missing: false, overLength: false, overCps: false, cps: 0 };
      const reason = reasonOf(err, activeCategories);
      const isMissingActive = err.missing && activeCategories.has("missing");
      html += `<div class="preview-card${cardClass(err, activeCategories)}" style="top:${offsets[i]}px">
        <div class="preview-card__id">#${c.id} · ${c.start} → ${c.end}</div>
        ${reason ? `<div class="preview-card__reason">${isMissingActive ? "✕" : "⚠"} ${escapeHtml(reason)}</div>` : ""}
        <div class="preview-card__src">${escapeHtml(c.source)}</div>
        <div class="preview-card__dst" contenteditable="true" data-editable="${c.id}">${escapeHtml(targetOf(c))}</div>
      </div>`;
    }
    spacer.innerHTML = html;
  }

  rebuildLayout();
  scrollHost.addEventListener("scroll", renderWindow, { passive: true });
  renderWindow();

  return {
    setFilter(query: string): number {
      const trimmed = query.trim();
      const idMatch = /^#(\d+)$/.exec(trimmed);
      if (!trimmed) cards = allCards;
      else if (idMatch) cards = allCards.filter((c) => c.id === Number(idMatch[1]));
      else {
        const needle = trimmed.toLowerCase();
        cards = allCards.filter((c) => c.source.toLowerCase().includes(needle) || targetOf(c).toLowerCase().includes(needle));
      }
      rebuildLayout();
      scrollHost.scrollTop = 0;
      renderWindow();
      return cards.length;
    },
    scrollToId(id: number): void {
      const index = allCards.findIndex((c) => c.id === id);
      if (index === -1) return;
      cards = allCards;
      rebuildLayout();
      renderWindow();
      scrollHost.scrollTop = Math.max(0, offsets[index] - 20);
    },
    refresh(): void {
      rebuildLayout();
      renderWindow();
    },
    getLayoutMetrics(): { offsets: number[]; totalHeight: number } {
      return { offsets, totalHeight: offsets[offsets.length - 1] || 1 };
    },
  };
}

export interface PreviewModalHandle {
  close(): void;
}

export function openPreviewModal(rawSrt: string, cards: PreviewCard[], options: PreviewModalOptions = {}): PreviewModalHandle {
  const edits = new Map<number, string>();
  const editingBefore = new Map<number, string>();
  const errorMap = new Map<number, CardErrorInfo>();
  const activeCategories = new Set<ErrorCategoryKey>();

  let undoStack: UndoEntry[] = [];
  let redoStack: UndoEntry[] = [];

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
            <input type="search" class="preview-search" placeholder="${t("preview.searchPlaceholder")}" />
            <span class="preview-match-count"></span>
            <button type="button" class="preview-icon-button" id="preview-undo" aria-label="${t("preview.undo")}" disabled>↺</button>
            <button type="button" class="preview-icon-button" id="preview-redo" aria-label="${t("preview.redo")}" disabled>↻</button>
            <button type="button" class="text-link" id="preview-toggle-replace">${t("preview.findReplace")}</button>
          </div>
          <div class="preview-replace-bar" id="preview-replace-bar" hidden>
            <input type="text" class="preview-search" id="preview-find-input" placeholder="${t("preview.findPlaceholder")}" />
            <input type="text" class="preview-search" id="preview-replace-input" placeholder="${t("preview.replacePlaceholder")}" />
            <button type="button" class="secondary" id="preview-replace-all">${t("preview.replaceAll")}</button>
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
  const searchInput = backdrop.querySelector<HTMLInputElement>(".preview-search")!;
  const matchCount = backdrop.querySelector<HTMLElement>(".preview-match-count")!;
  const errorArea = backdrop.querySelector<HTMLElement>("#preview-error-area")!;
  const errorButtonsEl = backdrop.querySelector<HTMLElement>("#preview-error-buttons")!;
  const errorCuesEl = backdrop.querySelector<HTMLElement>("#preview-error-cues")!;
  const undoButton = backdrop.querySelector<HTMLButtonElement>("#preview-undo")!;
  const redoButton = backdrop.querySelector<HTMLButtonElement>("#preview-redo")!;
  const applyButton = backdrop.querySelector<HTMLButtonElement>("#preview-apply")!;
  const replaceBar = backdrop.querySelector<HTMLElement>("#preview-replace-bar")!;
  const findInput = backdrop.querySelector<HTMLInputElement>("#preview-find-input")!;
  const replaceInput = backdrop.querySelector<HTMLInputElement>("#preview-replace-input")!;
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
        ⚠ ${t("preview.warning.overCps", { cps: "" }).replace(/[\s·()]+$/, "")} (${counts.overCps})
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
            matchCount.textContent = "";
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
    view.refresh();
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

  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  backdrop.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).closest("[data-editable]")) return;
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
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
    view.refresh();
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
  });

  backdrop.querySelector("#preview-toggle-replace")!.addEventListener("click", () => {
    replaceBar.hidden = !replaceBar.hidden;
    if (!replaceBar.hidden) findInput.focus();
  });
  backdrop.querySelector("#preview-replace-all")!.addEventListener("click", () => {
    const query = findInput.value;
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
    view.refresh();
  });

  searchInput.addEventListener("input", () => {
    const total = cards.length;
    const matched = view.setFilter(searchInput.value);
    matchCount.textContent = searchInput.value.trim() ? t("preview.matchCount", { matched, total }) : "";
  });

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

  return { close };
}
