import { t } from "../i18n";
import { buildPath, getRoute } from "../router";

export interface PreviewCard {
  id: number;
  start: string;
  end: string;
  source: string;
  target: string;
  missing?: boolean;
  warningReason?: string;
}

export interface PreviewApplyResult {
  rawSrt?: string;
  lastUpdatedLabel?: string;
}

export interface PreviewModalOptions {
  lastUpdatedLabel?: string;
  onApply?: (edits: Map<number, string>) => PreviewApplyResult | void;
}

type UndoEntry = { id: number; before: string; after: string }[];

const CARD_BASE_HEIGHT = 58;
const CARD_CHARS_PER_LINE = 42;
const CARD_LINE_HEIGHT = 20;
const RENDER_BUFFER_PX = 400;

function estimateCardHeight(card: PreviewCard, target: string): number {
  const lines = Math.max(1, Math.ceil((card.source.length || 1) / CARD_CHARS_PER_LINE)) +
    Math.max(1, Math.ceil((target.length || 1) / CARD_CHARS_PER_LINE));
  return CARD_BASE_HEIGHT + lines * CARD_LINE_HEIGHT;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cardClass(card: PreviewCard): string {
  if (card.missing) return " preview-card--missing";
  if (card.warningReason) return " preview-card--warning";
  return "";
}

function reasonOf(card: PreviewCard): string {
  return card.missing ? t("preview.warning.missing") : card.warningReason || "";
}

interface CardsView {
  setFilter(query: string): number;
  scrollToId(id: number): void;
  refresh(): void;
}

function createCardsView(scrollHost: HTMLElement, allCards: PreviewCard[], edits: Map<number, string>): CardsView {
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
      const reason = reasonOf(c);
      html += `<div class="preview-card${cardClass(c)}" style="top:${offsets[i]}px">
        <div class="preview-card__id">#${c.id} · ${c.start} → ${c.end}</div>
        ${reason ? `<div class="preview-card__reason">${c.missing ? "✕" : "⚠"} ${escapeHtml(reason)}</div>` : ""}
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
  };
}

export interface PreviewModalHandle {
  close(): void;
}

export function openPreviewModal(rawSrt: string, cards: PreviewCard[], options: PreviewModalOptions = {}): PreviewModalHandle {
  const problemCards = cards.filter((c) => c.missing || c.warningReason);
  const edits = new Map<number, string>();
  const editingBefore = new Map<number, string>();
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
        <button type="button" class="modal__close" aria-label="${t("preview.close")}">✕</button>
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
          <div class="preview-problem-list" style="display:${problemCards.length ? "flex" : "none"}"></div>
          <div class="preview-cards-host" style="height:56vh; overflow-y:auto"></div>
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
  const problemList = backdrop.querySelector<HTMLElement>(".preview-problem-list")!;
  const undoButton = backdrop.querySelector<HTMLButtonElement>("#preview-undo")!;
  const redoButton = backdrop.querySelector<HTMLButtonElement>("#preview-redo")!;
  const applyButton = backdrop.querySelector<HTMLButtonElement>("#preview-apply")!;
  const replaceBar = backdrop.querySelector<HTMLElement>("#preview-replace-bar")!;
  const findInput = backdrop.querySelector<HTMLInputElement>("#preview-find-input")!;
  const replaceInput = backdrop.querySelector<HTMLInputElement>("#preview-replace-input")!;
  let dirty = false;

  const view = createCardsView(cardsHost, cards, edits);

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
    edits.set(Number(el.dataset.editable), el.textContent || "");
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
    view.refresh();
  });

  problemList.innerHTML = problemCards.map((c) => `
    <button type="button" class="preview-problem-chip${c.missing ? " preview-problem-chip--missing" : ""}" data-jump="${c.id}" title="${escapeHtml(reasonOf(c))}">
      ${c.missing ? "✕" : "⚠"} #${c.id}
    </button>`).join("");
  problemList.querySelectorAll<HTMLButtonElement>("[data-jump]").forEach((chip) => {
    chip.addEventListener("click", () => {
      searchInput.value = "";
      matchCount.textContent = "";
      view.scrollToId(Number(chip.dataset.jump));
    });
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
    if (dirty) commit();
    document.body.style.overflow = "";
    backdrop.remove();
  }

  backdrop.querySelector(".modal__close")!.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

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
