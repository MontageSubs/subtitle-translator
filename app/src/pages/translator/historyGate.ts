import { getLocale, t } from "../../i18n";
import { closeGate, openGate, setGateHost } from "../../components/workspaceGate";
import { clearHistory, countHistoryJobs } from "../../lib/history/history";
import { onHistoryChange } from "../../lib/history/historyChange";
import { HISTORY_MAX_JOBS, historyUsageLevel } from "../../lib/history/historyQuota";
import { pageRoutePath } from "../../render/paths";
import { escapeHtml } from "../../utils/escapeHtml";
import { downloadHistoryBackup } from "../history/exports";

const GATE_CLASS = "history-gate";

export interface HistoryGateHandle {
  sync(): Promise<void>;
  isFull(): Promise<boolean>;
}

const DISMISSED_KEY = "history.warningDismissed";

function readWarningDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return warningDismissedInMemory;
  }
}

function writeWarningDismissed(dismissed: boolean): void {
  warningDismissedInMemory = dismissed;
  try {
    if (dismissed) sessionStorage.setItem(DISMISSED_KEY, "1");
    else sessionStorage.removeItem(DISMISSED_KEY);
  } catch {}
}

let warningDismissedInMemory = false;

function renderBody(count: number, closable: boolean): string {
  const historyHref = pageRoutePath(import.meta.env.BASE_URL, getLocale(), "history");
  const message = closable ? t("history.limit.warn", { count, max: HISTORY_MAX_JOBS }) : t("history.limit.full", { max: HISTORY_MAX_JOBS });
  const dismiss = closable ? `<button type="button" class="secondary" data-history-gate="dismiss">${t("history.limit.dismiss")}</button>` : "";
  return `
    <div class="${GATE_CLASS}">
      <p class="gate-panel__message">${escapeHtml(message)}</p>
      <div class="history-gate__actions">
        <button type="button" data-history-gate="export-clear">${t("history.limit.exportAndClear")}</button>
        <a class="secondary" href="${historyHref}">${t("history.limit.manage")}</a>
        ${dismiss}
      </div>
    </div>`;
}

export function mountHistoryGate(container: HTMLElement, signal: AbortSignal): HistoryGateHandle {
  setGateHost(container);

  let shownMessage = "";
  const isOwnGateOpen = (): boolean => container.querySelector(`.${GATE_CLASS}`) !== null;

  async function sync(): Promise<void> {
    const count = await countHistoryJobs().catch(() => 0);
    if (signal.aborted) return;
    const level = historyUsageLevel(count);
    if (level === "ok" || level === "full") writeWarningDismissed(false);
    if (level === "ok" || (level === "warn" && readWarningDismissed())) {
      if (isOwnGateOpen()) closeGate();
      shownMessage = "";
      return;
    }
    if (container.querySelector(".gate-panel__message") && !isOwnGateOpen()) return;
    const body = renderBody(count, level === "warn");
    if (isOwnGateOpen() && body === shownMessage) return;
    shownMessage = body;
    const gate = openGate({ title: t("history.limit.title"), body, help: false });
    gate.body.querySelector<HTMLElement>("[data-history-gate]")?.focus();
    gate.body.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>("[data-history-gate]")?.dataset.historyGate;
      if (action === "dismiss") {
        writeWarningDismissed(true);
        gate.close();
      } else if (action === "export-clear") {
        void downloadHistoryBackup().then(clearHistory);
      }
    }, { signal });
  }

  signal.addEventListener("abort", () => setGateHost(null), { once: true });
  onHistoryChange(() => { void sync(); }, signal);
  void sync();
  return { sync, isFull: async () => historyUsageLevel(await countHistoryJobs().catch(() => 0)) === "full" };
}
