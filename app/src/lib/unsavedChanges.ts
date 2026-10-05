let translationCompletedNotDownloaded = false;
let contextOrGlossaryEdited = false;
let previewModalDirty = false;

export function setTranslationCompletedNotDownloaded(val: boolean): void {
  translationCompletedNotDownloaded = val;
}

export function setContextOrGlossaryEdited(val: boolean): void {
  contextOrGlossaryEdited = val;
}

export function trackAssistEdits(contextText: string, glossaryLength: number): void {
  contextOrGlossaryEdited = contextText.trim().length > 0 || glossaryLength > 0;
}

export function setPreviewModalDirty(val: boolean): void {
  previewModalDirty = val;
}

function hasUnsavedChanges(): boolean {
  return translationCompletedNotDownloaded || contextOrGlossaryEdited || previewModalDirty;
}

let isListenerAttached = false;

export function initUnsavedChangesListener(): void {
  if (isListenerAttached) return;
  isListenerAttached = true;
  window.addEventListener("beforeunload", (e: BeforeUnloadEvent) => {
    if (hasUnsavedChanges()) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
  });
}
