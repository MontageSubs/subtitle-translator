const CONFIRM_TIMEOUT_MS = 4000;
const CONFIRM_CLASS = "action-pill--danger-confirm";

export interface ConfirmButtonOptions {
  button: HTMLButtonElement;
  label: HTMLElement;
  idleText: () => string;
  confirmText: () => string;
  onConfirm: () => void;
  signal?: AbortSignal;
}

export interface ConfirmButtonHandle {
  reset(): void;
}

export function mountConfirmButton({ button, label, idleText, confirmText, onConfirm, signal }: ConfirmButtonOptions): ConfirmButtonHandle {
  let timer: number | undefined;
  let confirming = false;

  function reset(): void {
    window.clearTimeout(timer);
    confirming = false;
    button.classList.remove(CONFIRM_CLASS);
    label.textContent = idleText();
  }

  button.addEventListener("click", () => {
    if (confirming) {
      reset();
      onConfirm();
      return;
    }
    confirming = true;
    button.classList.add(CONFIRM_CLASS);
    label.textContent = confirmText();
    timer = window.setTimeout(reset, CONFIRM_TIMEOUT_MS);
  }, { signal });

  return { reset };
}
