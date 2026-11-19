import { getLocale, t } from "../../i18n";
import { activeCooldownUntil, onCooldownChange } from "../../api/translation";
import { STORAGE_KEYS } from "../../config/storage";
import { formatCountdown } from "../../utils/elapsedFormat";
import { isClientOutdated, onClientOutdatedChange } from "../../update/updateWatcher";
import type { WorkspaceContext } from "./context";

const TICK_MS = 1000;
const TRANSLATE_BUTTON_SELECTORS = ["#task-retry-btn", "#task-resume-btn", "#retranslate-button"] as const;

export function mountCooldownGuard(ctx: WorkspaceContext): void {
  const buttons = TRANSLATE_BUTTON_SELECTORS.map((selector) => ctx.query<HTMLButtonElement>(selector));
  let timer: number | undefined;

  const sync = (): void => {
    window.clearTimeout(timer);
    const until = activeCooldownUntil();
    buttons.forEach((button) => { button.disabled = until !== null || isClientOutdated(); });
    ctx.task.updateHeader();
    ctx.root.querySelectorAll<HTMLElement>("[data-cooldown]").forEach((note) => {
      note.textContent = until === null ? note.dataset.cooldown ?? "" : t("error.cooldown", { time: formatCountdown(until - Date.now(), getLocale()) });
      if (until === null) note.removeAttribute("data-cooldown");
    });
    if (until !== null) timer = window.setTimeout(sync, Math.min(TICK_MS, until - Date.now()));
  };

  const stopListeningToCooldown = onCooldownChange(sync);
  const stopListeningToOutdated = onClientOutdatedChange(sync);
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === STORAGE_KEYS.workerCooldown) sync();
  }, { signal: ctx.signal });
  ctx.signal.addEventListener("abort", () => {
    window.clearTimeout(timer);
    stopListeningToCooldown();
    stopListeningToOutdated();
  }, { once: true });
  sync();
}
