import { getLocale, t } from "../../i18n";
import { activeCooldownUntil, isRescueSelected, onCooldownChange, translationHoldUntil } from "../../api/translation";
import { STORAGE_KEYS } from "../../config/storage";
import { formatCountdown } from "../../utils/elapsedFormat";
import { isClientOutdated, onClientOutdatedChange } from "../../update/updateWatcher";
import type { WorkspaceContext } from "./context";

const TICK_MS = 1000;
const WATCHED_STORAGE_KEYS: ReadonlySet<string> = new Set([STORAGE_KEYS.workerCooldown, STORAGE_KEYS.rescueClaimedDay]);
const CONTINUE_BUTTON_SELECTORS = ["#task-retry-btn", "#task-resume-btn"] as const;

export function mountCooldownGuard(ctx: WorkspaceContext): void {
  const continueButtons = CONTINUE_BUTTON_SELECTORS.map((selector) => ctx.query<HTMLButtonElement>(selector));
  const retranslateButton = ctx.query<HTMLButtonElement>("#retranslate-button");
  let timer: number | undefined;

  const sync = (): void => {
    ctx.task.updateHeader();
    window.clearTimeout(timer);
    const until = activeCooldownUntil();
    const held = translationHoldUntil() !== null || isClientOutdated();
    continueButtons.forEach((button) => { button.disabled = held; });
    retranslateButton.disabled = held || isRescueSelected();
    ctx.root.querySelectorAll<HTMLElement>("[data-cooldown]").forEach((note) => {
      note.textContent = until === null ? note.dataset.cooldown ?? "" : t("error.cooldown", { time: formatCountdown(until - Date.now(), getLocale()) });
      if (until === null) note.removeAttribute("data-cooldown");
    });
    if (until !== null) timer = window.setTimeout(sync, Math.min(TICK_MS, until - Date.now()));
  };

  const stopListeningToCooldown = onCooldownChange(sync);
  const stopListeningToOutdated = onClientOutdatedChange(sync);
  window.addEventListener("storage", (event) => {
    if (event.key === null || WATCHED_STORAGE_KEYS.has(event.key)) sync();
  }, { signal: ctx.signal });
  ctx.signal.addEventListener("abort", () => {
    window.clearTimeout(timer);
    stopListeningToCooldown();
    stopListeningToOutdated();
  }, { once: true });
  sync();
}
