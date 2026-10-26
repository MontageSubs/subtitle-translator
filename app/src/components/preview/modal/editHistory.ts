import { UndoEntry } from "../types";

export type ReplayDirection = "before" | "after";

export interface EditHistoryHandle {
  push(entry: UndoEntry): void;
  discard(entry: UndoEntry): void;
  undo(): void;
  redo(): void;
}

export interface EditHistoryOptions {
  undoButton: HTMLButtonElement;
  redoButton: HTMLButtonElement;
  replay(entry: UndoEntry, direction: ReplayDirection): void;
  onChange(): void;
  onApplied(): void;
}

export function mountEditHistory({ undoButton, redoButton, replay, onChange, onApplied }: EditHistoryOptions): EditHistoryHandle {
  let undoStack: UndoEntry[] = [];
  let redoStack: UndoEntry[] = [];

  function syncButtons(): void {
    undoButton.disabled = undoStack.length === 0;
    redoButton.disabled = redoStack.length === 0;
  }

  function replayEntry(entry: UndoEntry, direction: ReplayDirection): void {
    replay(entry, direction);
    onApplied();
    syncButtons();
    onChange();
  }

  const handle: EditHistoryHandle = {
    push(entry) {
      undoStack.push(entry);
      redoStack = [];
      syncButtons();
      onChange();
    },
    discard(entry) {
      undoStack = undoStack.filter((candidate) => candidate !== entry);
      syncButtons();
      onChange();
    },
    undo() {
      const entry = undoStack.pop();
      if (!entry) return;
      redoStack.push(entry);
      replayEntry(entry, "before");
    },
    redo() {
      const entry = redoStack.pop();
      if (!entry) return;
      undoStack.push(entry);
      replayEntry(entry, "after");
    },
  };

  undoButton.addEventListener("click", handle.undo);
  redoButton.addEventListener("click", handle.redo);
  return handle;
}
