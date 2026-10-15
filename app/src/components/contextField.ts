import { scopedQuery } from "../utils/dom";
import { t } from "../i18n";
import { CONTEXT_MAX_CHARS } from "../utils/context";
import { openHistoryImportModal } from "./historyImportModal";
import { setContextLocked, supportsContext } from "./contextInput";

export interface ContextFieldState {
  provider: string;
  contextText: string;
}

export interface ContextFieldHandle {
  setText(text: string): void;
  setHint(text: string): void;
  syncAvailability(): void;
}

export function mountContextField(
  container: HTMLElement,
  state: ContextFieldState,
  onChange: () => void
): ContextFieldHandle {
  const q = scopedQuery(container);
  const input = q<HTMLTextAreaElement>("#context-input");
  const counter = q<HTMLElement>("#context-counter");
  const hint = q<HTMLElement>("#context-hint");
  const clearBtn = q<HTMLButtonElement>("#context-clear");
  const importBtn = q<HTMLButtonElement>("#context-history-import");

  function updateCounter(): void {
    const length = state.contextText.trim().length;
    const overLimit = length > CONTEXT_MAX_CHARS;
    counter.textContent = `${length}/${CONTEXT_MAX_CHARS}`;
    counter.classList.toggle("field__counter--over", overLimit);
    hint.textContent = overLimit ? t("context.tooLong", { max: CONTEXT_MAX_CHARS }) : "";
  }

  function syncAvailability(): void {
    const locked = !supportsContext(state.provider);
    setContextLocked(input, locked);
    importBtn.disabled = locked;
    hint.textContent = "";
    updateCounter();
  }

  function setText(text: string): void {
    input.value = text;
    state.contextText = text;
    updateCounter();
  }

  function setHint(text: string): void {
    hint.textContent = text;
  }

  input.value = state.contextText;
  syncAvailability();

  clearBtn.addEventListener("click", () => {
    setText("");
    onChange();
    input.focus();
  });
  input.addEventListener("input", () => {
    state.contextText = input.value;
    updateCounter();
    onChange();
  });
  container.querySelector<HTMLButtonElement>("#context-history-import")?.addEventListener("click", () => {
    openHistoryImportModal("context", (res) => {
      if (res.contextText !== undefined) {
        setText(res.contextText);
        onChange();
      }
    });
  });

  return { setText, setHint, syncAvailability };
}
