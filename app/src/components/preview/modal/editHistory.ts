import { UndoEntry } from "../types";
import type { EditModel } from "./editModel";

export interface EditHistoryHandle {
  push(entry: UndoEntry): void;
  undo(): void;
  redo(): void;
}

export interface EditHistoryOptions {
  undoButton: HTMLButtonElement;
  redoButton: HTMLButtonElement;
  editor: EditModel;
  onChange(): void;
  onApplied(): void;
}

export function mountEditHistory({ undoButton, redoButton, editor, onChange, onApplied }: EditHistoryOptions): EditHistoryHandle {
  let undoStack: UndoEntry[] = [];
  let redoStack: UndoEntry[] = [];

  function syncButtons(): void {
    undoButton.disabled = undoStack.length === 0;
    redoButton.disabled = redoStack.length === 0;
  }

  function replay(entry: UndoEntry, direction: "before" | "after"): void {
    editor.replay(entry, direction);
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
    undo() {
      const entry = undoStack.pop();
      if (!entry) return;
      redoStack.push(entry);
      replay(entry, "before");
    },
    redo() {
      const entry = redoStack.pop();
      if (!entry) return;
      undoStack.push(entry);
      replay(entry, "after");
    },
  };

  undoButton.addEventListener("click", handle.undo);
  redoButton.addEventListener("click", handle.redo);
  return handle;
}
