const CONFIRM_TIMEOUT_MS = 4000;
const DEFAULT_CONFIRM_CLASS = "action-pill--danger-confirm";

export interface ConfirmButtonOptions {
  button: HTMLButtonElement;
  label: HTMLElement;
  idleText: () => string;
  confirmText: () => string;
  onConfirm: () => void;
  confirmClass?: string;
  signal?: AbortSignal;
}

export interface ConfirmButtonHandle {
  reset(): void;
}

export function mountConfirmButton({ button, label, idleText, confirmText, onConfirm, confirmClass = DEFAULT_CONFIRM_CLASS, signal }: ConfirmButtonOptions): ConfirmButtonHandle {
  let timer: number | undefined;
  let confirming = false;

  function reset(): void {
    window.clearTimeout(timer);
    confirming = false;
    button.classList.remove(confirmClass);
    label.textContent = idleText();
  }

  button.addEventListener("click", () => {
    if (confirming) {
      reset();
      onConfirm();
      return;
    }
    confirming = true;
    button.classList.add(confirmClass);
    label.textContent = confirmText();
    timer = window.setTimeout(reset, CONFIRM_TIMEOUT_MS);
  }, { signal });

  return { reset };
}
