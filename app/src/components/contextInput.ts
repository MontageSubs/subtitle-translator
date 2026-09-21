import { t } from "../i18n";
import { CLOSE_ICON } from "../render/icons";

const CONTEXT_UNSUPPORTED_PROVIDERS = new Set(["microsoft-nmt-edge"]);

export function supportsContext(provider: string): boolean {
  return !CONTEXT_UNSUPPORTED_PROVIDERS.has(provider);
}

export function renderContextInput(inputId: string, clearId: string, rows: number): string {
  return `<div class="input-with-clear">
    <textarea id="${inputId}" rows="${rows}" placeholder="${t("context.placeholder")}" aria-describedby="${inputId}-lock"></textarea>
    <button type="button" class="input-clear-btn" id="${clearId}" aria-label="${t("preview.clearSearch")}" hidden>${CLOSE_ICON}</button>
    <div class="input-lock" id="${inputId}-lock" hidden>${t("context.microsoftDisabled")}</div>
  </div>`;
}

export function setContextInputLocked(input: HTMLTextAreaElement, locked: boolean): void {
  input.disabled = locked;
  input.parentElement!.querySelector<HTMLElement>(".input-lock")!.hidden = !locked;
}
