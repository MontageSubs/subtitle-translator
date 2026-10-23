const CONFIRM_TIMEOUT_MS = 4000;
const UNDO_WINDOW_MS = 5000;
const COUNTDOWN_TICK_MS = 250;
const CONFIRMING_CLASS = "is-confirming";
const UNDOING_CLASS = "is-undoing";

type Stage = "idle" | "confirming" | "pending";

export interface ConfirmButtonUndo {
  text: (secondsLeft: number) => string;
  windowMs?: number;
  applyImmediately?: boolean;
  onPending?: () => void;
  onCancel?: () => void;
  onExpire?: () => void;
}

export interface ConfirmButtonOptions {
  button: HTMLButtonElement;
  label?: HTMLElement;
  idleText: () => string;
  confirmText: () => string;
  onConfirm: () => void | Promise<void>;
  undo?: ConfirmButtonUndo;
  icons?: { idle: string; confirm?: string; undo?: string };
  onArm?: () => void;
  signal?: AbortSignal;
}

export interface ConfirmButtonHandle {
  reset(): void;
  settle(): void;
  isPending(): boolean;
}

export function mountConfirmButton({ button, label, idleText, confirmText, onConfirm, undo, icons, onArm, signal }: ConfirmButtonOptions): ConfirmButtonHandle {
  let timer: number | undefined;
  let ticker: number | undefined;
  let stage: Stage = "idle";

  function present(text: string, icon?: string): void {
    if (label) label.textContent = text;
    else {
      button.title = text;
      button.setAttribute("aria-label", text);
    }
    if (icons && !label) button.innerHTML = icon ?? icons.idle;
  }

  function enter(next: Stage, text: string, icon: string | undefined, durationMs?: number, onExpire?: () => void): void {
    window.clearTimeout(timer);
    window.clearInterval(ticker);
    stage = next;
    button.classList.toggle(CONFIRMING_CLASS, next === "confirming");
    button.classList.toggle(UNDOING_CLASS, next === "pending");
    present(text, icon);
    if (durationMs) timer = window.setTimeout(onExpire ?? reset, durationMs);
  }

  function reset(): void {
    enter("idle", idleText(), icons?.idle);
  }

  function startPending(): void {
    const { windowMs = UNDO_WINDOW_MS, applyImmediately, text, onPending, onExpire } = undo!;
    const deadline = Date.now() + windowMs;
    const secondsLeft = () => Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
    onPending?.();
    enter("pending", text(secondsLeft()), icons?.undo, windowMs, () => {
      reset();
      if (applyImmediately) onExpire?.();
      else void onConfirm();
    });
    if (label) ticker = window.setInterval(() => present(text(secondsLeft()), icons?.undo), COUNTDOWN_TICK_MS);
    if (applyImmediately) void onConfirm();
  }

  function cancelPending(): void {
    reset();
    undo!.onCancel?.();
  }

  button.addEventListener("click", () => {
    if (stage === "pending") cancelPending();
    else if (stage === "confirming") {
      if (undo) startPending();
      else {
        reset();
        void onConfirm();
      }
    } else {
      enter("confirming", confirmText(), icons?.confirm, CONFIRM_TIMEOUT_MS);
      onArm?.();
    }
  }, { signal });

  signal?.addEventListener("abort", () => { window.clearTimeout(timer); window.clearInterval(ticker); }, { once: true });

  return { reset, settle: reset, isPending: () => stage === "pending" };
}
