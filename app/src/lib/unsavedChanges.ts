let translationCompletedNotDownloaded = false;
let contextOrGlossaryEdited = false;
let previewModalDirty = false;
let assistEditsPreserved = false;

const PRESERVATION_WINDOW_MS = 2000;

export function markAssistEditsPreserved(): void {
  assistEditsPreserved = true;
  setTimeout(() => { assistEditsPreserved = false; }, PRESERVATION_WINDOW_MS);
}

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

export function hasUnsavedChanges(): boolean {
  return translationCompletedNotDownloaded || previewModalDirty || (contextOrGlossaryEdited && !assistEditsPreserved);
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
}export function resetUnsavedChanges(): void {
  translationCompletedNotDownloaded = false;
  contextOrGlossaryEdited = false;
  previewModalDirty = false;
  assistEditsPreserved = false;
}
