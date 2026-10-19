import { getLocale, t } from "../../i18n";
import { activeAccessBlock, onAccessBlockChange } from "../../api/translation/access";
import { closeGate, openGate, setGateHost } from "../../components/workspaceGate";
import { escapeHtml } from "../../utils/escapeHtml";
import { formatDateTime } from "../../utils/localeFormat";

const MAX_TIMER_MS = 2 ** 31 - 1;
const EXPIRY_GRACE_MS = 250;

export function mountAccessGate(container: HTMLElement, signal: AbortSignal): void {
  let timer: number | undefined;
  setGateHost(container);

  const sync = (): void => {
    window.clearTimeout(timer);
    const retryAt = activeAccessBlock();
    if (!retryAt) {
      if (container.querySelector(".gate-panel__message")) closeGate();
      return;
    }
    const message = t("gate.blocked.body", { time: formatDateTime(retryAt, getLocale()) });
    openGate({ title: t("gate.blocked.title"), body: `<p class="gate-panel__message">${escapeHtml(message)}</p>` });
    timer = window.setTimeout(sync, Math.min(retryAt - Date.now() + EXPIRY_GRACE_MS, MAX_TIMER_MS));
  };

  const stopListening = onAccessBlockChange(sync);
  signal.addEventListener("abort", () => {
    window.clearTimeout(timer);
    stopListening();
    setGateHost(null);
  }, { once: true });
  sync();
}
