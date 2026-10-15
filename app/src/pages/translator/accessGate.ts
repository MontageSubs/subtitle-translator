import { getLocale, t } from "../../i18n";
import { activeAccessBlock, onAccessBlockChange } from "../../api/translation/access";
import { renderGatePanel } from "../../components/gatePanel";
import { escapeHtml } from "../../utils/escapeHtml";
import { formatDateTime } from "../../utils/localeFormat";

const MAX_TIMER_MS = 2 ** 31 - 1;
const EXPIRY_GRACE_MS = 250;

export function mountAccessGate(host: HTMLElement, signal: AbortSignal): void {
  const gate = document.createElement("div");
  gate.className = "access-gate";
  let timer: number | undefined;

  const setGated = (gated: boolean): void => {
    host.classList.toggle("workspace--gated", gated);
    for (const child of Array.from(host.children)) if (child !== gate) child.toggleAttribute("inert", gated);
  };

  const sync = (): void => {
    window.clearTimeout(timer);
    const retryAt = activeAccessBlock();
    if (!retryAt) {
      gate.remove();
      setGated(false);
      return;
    }
    const message = t("gate.blocked.body", { time: formatDateTime(retryAt, getLocale()) });
    gate.innerHTML = renderGatePanel({ title: t("gate.blocked.title"), body: `<p class="gate-panel__message">${escapeHtml(message)}</p>` });
    host.append(gate);
    setGated(true);
    timer = window.setTimeout(sync, Math.min(retryAt - Date.now() + EXPIRY_GRACE_MS, MAX_TIMER_MS));
  };

  const stopListening = onAccessBlockChange(sync);
  signal.addEventListener("abort", () => {
    window.clearTimeout(timer);
    stopListening();
  }, { once: true });
  sync();
}
