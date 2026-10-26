import { CONTEXT_MAX_CHARS } from "../../../utils/context";
import { mountGlossaryEditor, GlossaryEditorHandle } from "../../glossaryEditor";
import { openHistoryImportModal } from "../../historyImportModal";
import { mountContextClear, setContextLocked, supportsContext } from "../../contextInput";
import type { PreviewSession } from "./session";

export interface AssistTabsHandle {
  contextText(): string;
  glossary: GlossaryEditorHandle;
}

export function mountAssistTabs(session: PreviewSession): AssistTabsHandle {
  const { options } = session;
  const input = session.query<HTMLTextAreaElement>("#preview-context-input");
  const clearButton = session.query<HTMLButtonElement>("#preview-context-clear");
  const counter = session.query<HTMLElement>("#preview-context-counter");
  const importButton = session.query<HTMLButtonElement>("#preview-context-history-import");
  const locked = !supportsContext(options.provider ?? "");
  let contextText = options.initialContext || "";

  function renderCounter(): void {
    const length = contextText.trim().length;
    counter.textContent = `${length}/${CONTEXT_MAX_CHARS}`;
    counter.classList.toggle("field__counter--over", length > CONTEXT_MAX_CHARS);
  }

  function writeContext(next: string): void {
    contextText = next;
    input.value = next;
    renderCounter();
    session.syncDirty();
  }

  input.value = contextText;
  setContextLocked(input, locked);
  importButton.disabled = locked;
  renderCounter();

  const clearControl = mountContextClear({ button: clearButton, read: () => contextText, write: writeContext });

  input.addEventListener("input", () => {
    clearControl.discardPending();
    contextText = input.value;
    renderCounter();
    session.syncDirty();
  });
  importButton.addEventListener("click", () => {
    openHistoryImportModal("context", (result) => {
      if (!result.contextText) return;
      clearControl.discardPending();
      writeContext(result.contextText);
    });
  });

  const glossary = mountGlossaryEditor(session.query("#preview-glossary-editor"), options.initialGlossary || [], {
    minRows: 3,
    signal: session.signal,
    onChange: session.syncDirty,
  });

  return { contextText: () => contextText.trim(), glossary };
}
