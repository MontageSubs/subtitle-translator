import { CONTEXT_MAX_CHARS } from "../../../utils/context";
import { mountGlossaryEditor, GlossaryEditorHandle } from "../../glossaryEditor";
import { openHistoryImportModal } from "../../historyImportModal";
import { setContextInputLocked, supportsContext } from "../../contextInput";
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
    clearButton.hidden = locked || input.value.length === 0;
  }

  function setContext(next: string, markDirty: boolean): void {
    contextText = next;
    input.value = next;
    renderCounter();
    if (markDirty) session.markDirty();
  }

  input.value = contextText;
  setContextInputLocked(input, locked);
  counter.hidden = locked;
  importButton.disabled = locked;
  renderCounter();

  clearButton.addEventListener("click", () => {
    setContext("", true);
    input.focus();
  });
  input.addEventListener("input", () => {
    contextText = input.value;
    renderCounter();
    session.markDirty();
  });
  importButton.addEventListener("click", () => {
    openHistoryImportModal("context", (result) => {
      if (result.contextText) setContext(result.contextText, true);
    });
  });

  const glossary = mountGlossaryEditor(session.query("#preview-glossary-editor"), options.initialGlossary || [], {
    minRows: 3,
    signal: session.signal,
    onChange: session.markDirty,
  });

  return { contextText: () => contextText, glossary };
}
