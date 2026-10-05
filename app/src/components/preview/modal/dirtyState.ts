import { setPreviewModalDirty } from "../../../lib/unsavedChanges";

export interface DirtyState {
  readonly isDirty: boolean;
  mark(): void;
  clear(): void;
}

export function createDirtyState(applyButtons: NodeListOf<HTMLButtonElement>): DirtyState {
  let dirty = false;
  const setButtons = (disabled: boolean) => applyButtons.forEach((button) => { button.disabled = disabled; });
  return {
    get isDirty() { return dirty; },
    mark() {
      dirty = true;
      setPreviewModalDirty(true);
      setButtons(false);
    },
    clear() {
      dirty = false;
      setPreviewModalDirty(false);
      setButtons(true);
    },
  };
}
