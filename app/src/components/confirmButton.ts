const CONFIRM_TIMEOUT_MS = 4000;
const CONFIRMING_CLASS = "is-confirming";

export interface ConfirmButtonOptions {
  button: HTMLButtonElement;
  label: HTMLElement;
  idleText: () => string;
  confirmText: () => string;
  onConfirm: () => void;
  onArm?: () => void;
  signal?: AbortSignal;
}

export interface ConfirmButtonHandle {
  reset(): void;
}

export function mountConfirmButton({ button, label, idleText, confirmText, onConfirm, onArm, signal }: ConfirmButtonOptions): ConfirmButtonHandle {
  let timer: number | undefined;
  let confirming = false;

  function reset(): void {
    window.clearTimeout(timer);
    confirming = false;
    button.classList.remove(CONFIRMING_CLASS);
    label.textContent = idleText();
  }

  button.addEventListener("click", () => {
    if (confirming) {
      reset();
      onConfirm();
      return;
    }
    confirming = true;
    button.classList.add(CONFIRMING_CLASS);
    label.textContent = confirmText();
    onArm?.();
    timer = window.setTimeout(reset, CONFIRM_TIMEOUT_MS);
  }, { signal });

  return { reset };
}
