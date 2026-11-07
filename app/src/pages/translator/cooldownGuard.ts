import { t } from "../../i18n";
import { activeCooldownUntil, onCooldownChange } from "../../api/translation";
import type { WorkspaceContext } from "./context";

const TICK_MS = 1000;
const TRANSLATE_BUTTON_SELECTORS = ["#task-retry-btn", "#task-resume-btn", "#retranslate-button"] as const;

export function mountCooldownGuard(ctx: WorkspaceContext): void {
  const buttons = TRANSLATE_BUTTON_SELECTORS.map((selector) => ctx.query<HTMLButtonElement>(selector));
  let timer: number | undefined;

  const sync = (): void => {
    window.clearTimeout(timer);
    const until = activeCooldownUntil();
    const seconds = until === null ? 0 : Math.ceil((until - Date.now()) / 1000);
    buttons.forEach((button) => { button.disabled = until !== null; });
    ctx.task.updateHeader();
    ctx.root.querySelectorAll<HTMLElement>("[data-cooldown]").forEach((note) => {
      note.textContent = until === null ? note.dataset.cooldown ?? "" : t("error.cooldown", { count: seconds });
      if (until === null) note.removeAttribute("data-cooldown");
    });
    if (until !== null) timer = window.setTimeout(sync, Math.min(TICK_MS, until - Date.now()));
  };

  const stopListening = onCooldownChange(sync);
  ctx.signal.addEventListener("abort", () => {
    window.clearTimeout(timer);
    stopListening();
  }, { once: true });
  sync();
}
