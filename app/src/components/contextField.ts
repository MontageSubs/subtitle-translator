import { t } from "../i18n";
import { CONTEXT_MAX_CHARS } from "../utils/context";
import { openHistoryImportModal } from "./historyImportModal";

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
  const q = <T extends HTMLElement>(selector: string) => container.querySelector(selector) as T;
  const input = q<HTMLTextAreaElement>("#context-input");
  const counter = q<HTMLElement>("#context-counter");
  const hint = q<HTMLElement>("#context-hint");
  const clearBtn = q<HTMLButtonElement>("#context-clear");
  const desc = q<HTMLElement>("#context-desc");

  function updateCounter(): void {
    const length = state.contextText.trim().length;
    const overLimit = length > CONTEXT_MAX_CHARS;
    counter.textContent = `${length}/${CONTEXT_MAX_CHARS}`;
    counter.classList.toggle("field__counter--over", overLimit);
    hint.textContent = overLimit ? t("context.tooLong", { max: CONTEXT_MAX_CHARS }) : "";
    clearBtn.hidden = input.value.length === 0;
  }

  function syncAvailability(): void {
    const disabled = state.provider === "microsoft-nmt-edge";
    input.disabled = disabled;
    desc.textContent = disabled ? t("context.microsoftDisabled") : t("context.desc");
    hint.textContent = "";
    if (!disabled) updateCounter();
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
  clearBtn.hidden = input.value.length === 0;
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
