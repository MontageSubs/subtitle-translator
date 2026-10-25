import { AnCornerOrDefault } from "../../../lib/subtitle/formats/topAlign";
import { setPreviewModalDirty } from "../../../lib/unsavedChanges";
import type { AssistTabsHandle } from "./assistTabs";
import type { EditModel } from "./editModel";

export interface DirtyState {
  readonly isDirty: boolean;
  sync(): void;
  rebase(): void;
}

export interface EditSources {
  editor: EditModel;
  positionEdits: ReadonlyMap<number, AnCornerOrDefault>;
  assist: AssistTabsHandle;
}

const byKey = <T>([a]: [number, T], [b]: [number, T]) => a - b;

export function readEditSignature({ editor, positionEdits, assist }: EditSources): string {
  return JSON.stringify([
    [...editor.snapshot()].sort(byKey),
    [...positionEdits].sort(byKey),
    assist.contextText().trim(),
    assist.glossary.getEntries().map(({ source, target }) => [source.trim(), target.trim()]),
  ]);
}

export function createDirtyState(applyButtons: NodeListOf<HTMLButtonElement>, readSignature: () => string): DirtyState {
  let baseline = "";
  let dirty = false;

  function render(next: boolean): void {
    dirty = next;
    setPreviewModalDirty(next);
    applyButtons.forEach((button) => { button.disabled = !next; });
  }

  return {
    get isDirty() { return dirty; },
    sync() {
      const next = readSignature() !== baseline;
      if (next !== dirty) render(next);
    },
    rebase() {
      baseline = readSignature();
      render(false);
    },
  };
}
