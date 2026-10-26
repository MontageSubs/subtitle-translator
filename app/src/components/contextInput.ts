import { labelAttrs } from "../utils/labelAttrs";
import { t } from "../i18n";
import { CLOSE_ICON, UNDO_ICON, renderCheckIcon } from "../render/icons";
import { mountConfirmButton } from "./confirmButton";

const CONTEXT_UNSUPPORTED_PROVIDERS = new Set(["microsoft-nmt-edge"]);

export function supportsContext(provider: string): boolean {
  return !CONTEXT_UNSUPPORTED_PROVIDERS.has(provider);
}

export function renderContextInput(inputId: string, clearId: string, rows: number): string {
  return `<div class="input-with-clear">
    <textarea id="${inputId}" rows="${rows}" placeholder="${t("context.placeholder")}" aria-describedby="${inputId}-lock"></textarea>
    <button type="button" class="input-clear-btn" id="${clearId}" ${labelAttrs(t("context.clear"))}>${CLOSE_ICON}</button>
    <div class="field-lock" id="${inputId}-lock" hidden>${t("context.unsupported")}</div>
  </div>`;
}

export function setContextLocked(input: HTMLTextAreaElement, locked: boolean): void {
  input.disabled = locked;
  input.parentElement!.querySelector<HTMLElement>(".field-lock")!.hidden = !locked;
}

export interface ContextClearOptions {
  button: HTMLButtonElement;
  read(): string;
  write(text: string): void;
}

export interface ContextClearHandle {
  discardPending(): void;
}

export function mountContextClear({ button, read, write }: ContextClearOptions): ContextClearHandle {
  let stashedText: string | null = null;
  const control = mountConfirmButton({
    button,
    idleText: () => t("context.clear"),
    confirmText: () => t("context.clearConfirm"),
    icons: { idle: CLOSE_ICON, confirm: renderCheckIcon(16), undo: UNDO_ICON },
    onConfirm: () => {
      stashedText = null;
    },
    undo: {
      text: () => t("common.undo"),
      onPending: () => {
        stashedText = read();
        write("");
      },
      onCancel: () => {
        if (stashedText === null) return;
        write(stashedText);
        stashedText = null;
      },
    },
  });
  return {
    discardPending() {
      stashedText = null;
      control.settle();
    },
  };
}
