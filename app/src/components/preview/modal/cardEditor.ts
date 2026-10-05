import { t } from "../../../i18n";
import { describeReasons, isSevere, isSoftWarning } from "../metrics/cardErrors";
import { createPositionPopover } from "../../positionPopover";
import type { PreviewSession } from "./session";

const EDITABLE_SELECTOR = "[data-editable]";

function editorText(element: HTMLElement): string {
  return (element.innerText ?? element.textContent ?? "").replace(/\r\n/g, "\n");
}

export function mountCardEditor(session: PreviewSession, host: HTMLElement): void {
  const popover = createPositionPopover();
  const editingBefore = new Map<number, string>();
  let anchorId: number | null = null;

  const cardById = (id: number) => session.cards.find((card) => card.id === id)!;
  const editableOf = (target: EventTarget | null) => (target as HTMLElement).closest<HTMLElement>(EDITABLE_SELECTOR);

  function commitEdit(id: number, text: string): void {
    if (text === cardById(id).target) session.edits.delete(id);
    else session.edits.set(id, text);
  }

  function clearSelection(): void {
    session.selectedForBatch.clear();
    anchorId = null;
  }

  function openPositionPicker(id: number): void {
    const batchIds = session.selectedForBatch.size > 1 ? [...session.selectedForBatch] : [id];
    clearSelection();
    session.view.refresh();
    const current = session.positionEdits.get(id) ?? cardById(id).topAlignAn ?? 2;
    const title = batchIds.length > 1 ? t("positionPicker.titleBatch", { count: batchIds.length }) : t("positionPicker.title");
    popover.open(current, title, (value) => {
      batchIds.forEach((cueId) => session.positionEdits.set(cueId, value));
      session.markDirty();
      session.view.refresh();
    });
  }

  function extendSelection(id: number): void {
    if (anchorId === null) {
      anchorId = id;
      session.selectedForBatch.clear();
      session.selectedForBatch.add(id);
      return;
    }
    const displayed = session.view.getDisplayedCards();
    const anchorIndex = displayed.findIndex((card) => card.id === anchorId);
    const clickedIndex = displayed.findIndex((card) => card.id === id);
    if (anchorIndex === -1 || clickedIndex === -1) return;
    session.selectedForBatch.clear();
    displayed
      .slice(Math.min(anchorIndex, clickedIndex), Math.max(anchorIndex, clickedIndex) + 1)
      .forEach((card) => session.selectedForBatch.add(card.id));
  }

  function toggleSelection(id: number): void {
    if (session.selectedForBatch.size === 1 && session.selectedForBatch.has(id)) {
      clearSelection();
      return;
    }
    session.selectedForBatch.clear();
    session.selectedForBatch.add(id);
    anchorId = id;
  }

  function syncCardState(element: HTMLElement, id: number): void {
    const cardElement = element.closest<HTMLElement>(".preview-card");
    if (!cardElement) return;
    cardElement.classList.toggle("preview-card--edited", session.edits.has(id));
    const error = session.errorMap.get(id);
    if (!error) return;

    const categories = session.activeCategories;
    const severeMissing = error.missing && categories.has("missing");
    const severeLeaked = error.leaked && categories.has("leaked");
    const hasWarning = (error.overLength && categories.has("overLength")) || (error.overCps && categories.has("overCps"));
    const soft = isSoftWarning(error, categories, session.softWarningMode);
    const plainWarning = !severeMissing && !severeLeaked && hasWarning;

    cardElement.classList.toggle("preview-card--missing", severeMissing);
    cardElement.classList.toggle("preview-card--leaked", severeLeaked);
    cardElement.classList.toggle("preview-card--warning", plainWarning && !soft);
    cardElement.classList.toggle("preview-card--soft-warning", plainWarning && soft);

    const reason = describeReasons(error, categories);
    const reasonElement = cardElement.querySelector<HTMLElement>(".preview-card__reason");
    if (!reason) {
      reasonElement?.remove();
      return;
    }
    const text = `${isSevere(error, categories) ? "✕" : "⚠"} ${reason}`;
    if (reasonElement) {
      reasonElement.textContent = text;
      return;
    }
    const created = document.createElement("div");
    created.className = "preview-card__reason";
    created.setAttribute("role", "alert");
    created.setAttribute("aria-live", "polite");
    created.textContent = text;
    cardElement.insertBefore(created, cardElement.firstChild);
  }

  function handleInput(element: HTMLElement): void {
    const id = Number(element.dataset.editable);
    const text = editorText(element);
    commitEdit(id, text);
    session.errors.evaluateCard(cardById(id), text);
    session.errors.render();
    syncCardState(element, id);
    session.view.adjustCardHeight(id);
  }

  host.addEventListener("mousedown", (event) => {
    if (event.shiftKey && (event.target as HTMLElement).closest(".preview-card")) {
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    const element = editableOf(event.target);
    if (element && element.getAttribute("contenteditable") !== "true") element.setAttribute("contenteditable", "true");
  });

  host.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const cardElement = target.closest<HTMLElement>(".preview-card");
    if (!cardElement) return;
    const id = Number(cardElement.dataset.cardId);

    if (target.closest("[data-pos-badge]")) {
      openPositionPicker(id);
      return;
    }
    if (target.closest(EDITABLE_SELECTOR)) return;
    if (event.shiftKey) extendSelection(id);
    else toggleSelection(id);
    session.view.refresh();
  });

  host.addEventListener("keydown", (event) => {
    const element = editableOf(event.target);
    if (!element) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (element.getAttribute("contenteditable") === "true") {
      if (event.key === "Enter" && !modifier) {
        event.preventDefault();
        document.execCommand("insertLineBreak");
        handleInput(element);
      } else if ((event.key === "Enter" && modifier) || event.key === "Escape") {
        event.preventDefault();
        element.blur();
      }
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      element.setAttribute("contenteditable", "true");
      element.focus();
    }
  });

  host.addEventListener("focusin", (event) => {
    const element = editableOf(event.target);
    if (!element) return;
    const id = Number(element.dataset.editable);
    editingBefore.set(id, session.edits.get(id) ?? cardById(id).target);
  });

  host.addEventListener("input", (event) => {
    const element = editableOf(event.target);
    if (element) handleInput(element);
  });

  host.addEventListener("focusout", (event) => {
    const element = editableOf(event.target);
    if (!element) return;
    element.removeAttribute("contenteditable");
    const id = Number(element.dataset.editable);
    const before = editingBefore.get(id);
    editingBefore.delete(id);
    const after = editorText(element);
    commitEdit(id, after);
    element.closest<HTMLElement>(".preview-card")?.classList.toggle("preview-card--edited", session.edits.has(id));
    if (before === undefined || before === after) return;
    session.history.push([{ id, before, after }]);
    session.view.refresh();
  });
}
