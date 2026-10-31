import { t } from "../../../i18n";
import { describeReasons, isSevere, isSoftWarning } from "../metrics/cardErrors";
import { createPositionPopover } from "../../positionPopover";
import { collapseLineBreaks } from "../../../lib/subtitle/postprocess/displayText";
import type { TextChange, UndoEntry } from "../types";
import type { PreviewSession } from "./session";

const EDITABLE_SELECTOR = "[data-editable]";

function setEditing(element: HTMLElement, editing: boolean): void {
  if (editing) element.setAttribute("contenteditable", "true");
  else element.removeAttribute("contenteditable");
  element.setAttribute("aria-readonly", String(!editing));
}

function editorText(element: HTMLElement): string {
  return (element.innerText ?? element.textContent ?? "").replace(/\r\n/g, "\n");
}

export function mountCardEditor(session: PreviewSession, host: HTMLElement): void {
  const popover = createPositionPopover();
  const editingBefore = new Map<number, string>();
  let liveEdit: { change: TextChange; entry: UndoEntry } | null = null;
  let anchorId: number | null = null;

  const cardById = (id: number) => session.cards.find((card) => card.id === id)!;
  const editableOf = (target: EventTarget | null) => (target as HTMLElement).closest<HTMLElement>(EDITABLE_SELECTOR);

  function clearSelection(): void {
    session.selectedForBatch.clear();
    anchorId = null;
  }

  function openPositionPicker(id: number): void {
    const batchIds = session.selectedForBatch.size > 1 ? [...session.selectedForBatch] : [id];
    clearSelection();
    session.view.refresh();
    const title = batchIds.length > 1 ? t("positionPicker.titleBatch", { count: batchIds.length }) : t("positionPicker.title");
    popover.open(session.positions.valueOf(id), title, (value) => {
      const entry: UndoEntry = [];
      batchIds.forEach((cueId) => {
        const before = session.positions.valueOf(cueId);
        if (before === value) return;
        session.positions.assign(cueId, value);
        entry.push({ kind: "position", id: cueId, before, after: value });
      });
      if (entry.length) session.history.push(entry);
      session.view.refresh();
    }, session.positionRule);
  }

  function trackLiveEdit(id: number, after: string): void {
    const before = editingBefore.get(id);
    if (before === undefined) return;
    if (before === after) {
      if (liveEdit) session.history.discard(liveEdit.entry);
      liveEdit = null;
      return;
    }
    if (liveEdit) {
      liveEdit.change.after = after;
      return;
    }
    const change: TextChange = { kind: "text", id, before, after };
    liveEdit = { change, entry: [change] };
    session.history.push(liveEdit.entry);
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
      .filter((card) => !card.locked)
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
    cardElement.classList.toggle("preview-card--edited", session.editor.isEdited(id));
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
    const text = session.editor.set(id, editorText(element));
    trackLiveEdit(id, text);
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
    if (element && element.getAttribute("contenteditable") !== "true") setEditing(element, true);
  });

  host.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const cardElement = target.closest<HTMLElement>(".preview-card");
    if (!cardElement || !getSelection()?.isCollapsed) return;
    const id = Number(cardElement.dataset.cardId);
    if (cardById(id).locked) return;

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
        if (session.singleLine) {
          element.blur();
        } else {
          document.execCommand("insertLineBreak");
          handleInput(element);
        }
      } else if ((event.key === "Enter" && modifier) || event.key === "Escape") {
        event.preventDefault();
        element.blur();
      }
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      setEditing(element, true);
      element.focus();
    }
  });

  host.addEventListener("focusin", (event) => {
    const element = editableOf(event.target);
    if (!element) return;
    const id = Number(element.dataset.editable);
    editingBefore.set(id, session.editor.targetOf(cardById(id)));
    liveEdit = null;
  });

  host.addEventListener("input", (event) => {
    const element = editableOf(event.target);
    if (element) handleInput(element);
  });

  host.addEventListener("paste", (event) => {
    if (!editableOf(event.target)) return;
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, session.singleLine ? collapseLineBreaks(text) : text);
  });

  host.addEventListener("focusout", (event) => {
    const element = editableOf(event.target);
    if (!element) return;
    setEditing(element, false);
    const id = Number(element.dataset.editable);
    const before = editingBefore.get(id);
    const typed = editorText(element);
    const after = session.editor.set(id, typed);
    trackLiveEdit(id, after);
    editingBefore.delete(id);
    liveEdit = null;
    element.closest<HTMLElement>(".preview-card")?.classList.toggle("preview-card--edited", session.editor.isEdited(id));
    session.syncDirty();
    if (typed !== after) {
      element.textContent = after;
      session.view.adjustCardHeight(id);
    }
    if (before !== after) session.view.refresh();
  });
}
