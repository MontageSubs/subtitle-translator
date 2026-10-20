import { getLocale, t } from "../../i18n";
import { closeGate, openGate, setGateHost } from "../../components/workspaceGate";
import { clearHistory, countHistoryJobs } from "../../lib/history/history";
import { HISTORY_MAX_JOBS, historyUsageLevel } from "../../lib/history/historyQuota";
import { pageRoutePath } from "../../render/paths";
import { escapeHtml } from "../../utils/escapeHtml";
import { downloadHistoryBackup } from "../history/exports";

const GATE_CLASS = "history-gate";

export interface HistoryGateHandle {
  sync(): Promise<void>;
  isFull(): Promise<boolean>;
}

let warningDismissed = false;

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

  const isOwnGateOpen = (): boolean => container.querySelector(`.${GATE_CLASS}`) !== null;

  async function sync(): Promise<void> {
    const count = await countHistoryJobs().catch(() => 0);
    if (signal.aborted) return;
    const level = historyUsageLevel(count);
    if (level === "ok" || (level === "warn" && warningDismissed)) {
      if (isOwnGateOpen()) closeGate();
      return;
    }
    if (container.querySelector(".gate-panel__message") && !isOwnGateOpen()) return;
    const gate = openGate({ title: t("history.limit.title"), body: renderBody(count, level === "warn"), help: false });
    gate.body.querySelector<HTMLElement>("[data-history-gate]")?.focus();
    gate.body.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>("[data-history-gate]")?.dataset.historyGate;
      if (action === "dismiss") {
        warningDismissed = true;
        gate.close();
      } else if (action === "export-clear") {
        void downloadHistoryBackup().then(clearHistory).then(sync);
      }
    }, { signal });
  }

  signal.addEventListener("abort", () => setGateHost(null), { once: true });
  void sync();
  return { sync, isFull: async () => historyUsageLevel(await countHistoryJobs().catch(() => 0)) === "full" };
}
