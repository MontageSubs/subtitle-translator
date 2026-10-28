import { getLocale, t } from "../../i18n";
import { closeGate, openGate, setGateHost } from "../../components/workspaceGate";
import { clearHistory, countHistoryJobs } from "../../lib/history/history";
import { onHistoryChange } from "../../lib/history/historyChange";
import { HISTORY_MAX_JOBS, historyUsageLevel } from "../../lib/history/historyQuota";
import { pageRoutePath } from "../../render/paths";
import { STORAGE_KEYS } from "../../config/storage";
import { DOWNLOAD_ICON, TRASH_ICON } from "../../render/icons";
import { escapeHtml } from "../../utils/escapeHtml";
import { tabStorage } from "../../utils/safeStorage";
import { downloadHistoryBackup } from "../history/exports";

const GATE_CLASS = "history-gate";

export interface HistoryGateHandle {
  sync(): Promise<void>;
  isFull(): Promise<boolean>;
}


const readWarningDismissed = (): boolean => warningDismissedInMemory || tabStorage.getItem(STORAGE_KEYS.historyWarningDismissed) === "1";

function writeWarningDismissed(dismissed: boolean): void {
  warningDismissedInMemory = dismissed;
  if (dismissed) tabStorage.setItem(STORAGE_KEYS.historyWarningDismissed, "1");
  else tabStorage.removeItem(STORAGE_KEYS.historyWarningDismissed);
}

let warningDismissedInMemory = false;

function renderBody(count: number, closable: boolean): string {
  const historyHref = pageRoutePath(import.meta.env.BASE_URL, getLocale(), "history");
  const message = closable ? t("history.limit.warn", { count, max: HISTORY_MAX_JOBS }) : t("history.limit.full", { max: HISTORY_MAX_JOBS });
  const dismiss = closable ? `<button type="button" class="action-pill" data-history-gate="dismiss">${t("history.limit.dismiss")}</button>` : "";
  return `
    <div class="${GATE_CLASS}">
      <p class="gate-panel__message">${escapeHtml(message)}</p>
      <p class="gate-panel__note" data-history-gate-exported role="status" hidden>${t("history.limit.exported")}</p>
      <div class="history-gate__actions">
        <button type="button" class="action-pill action-pill--accent" data-history-gate="export-clear">${DOWNLOAD_ICON}<span>${t("history.limit.exportAndClear")}</span></button>
        <a class="action-pill" href="${historyHref}">${t("history.limit.manage")}</a>
        ${dismiss}
      </div>
    </div>`;
}

async function exportThenArmClear(body: HTMLElement): Promise<void> {
  const button = body.querySelector<HTMLButtonElement>('[data-history-gate="export-clear"]');
  if (!button) return;
  button.disabled = true;
  try {
    await downloadHistoryBackup();
  } catch {
    button.disabled = false;
    return;
  }
  button.disabled = false;
  button.dataset.historyGate = "clear";
  button.innerHTML = `${TRASH_ICON}<span>${t("history.limit.clear")}</span>`;
  body.querySelector<HTMLElement>("[data-history-gate-exported]")!.hidden = false;
  button.focus();
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
    const gate = openGate({ title: t("history.limit.title"), body, help: false, wide: true });
    gate.body.querySelector<HTMLElement>("[data-history-gate]")?.focus();
    gate.body.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>("[data-history-gate]")?.dataset.historyGate;
      if (action === "dismiss") {
        writeWarningDismissed(true);
        gate.close();
      } else if (action === "export-clear") {
        void exportThenArmClear(gate.body);
      } else if (action === "clear") {
        void clearHistory();
      }
    }, { signal });
  }

  signal.addEventListener("abort", () => setGateHost(null), { once: true });
  onHistoryChange(() => { void sync(); }, signal);
  void sync();
  return { sync, isFull: async () => historyUsageLevel(await countHistoryJobs().catch(() => 0)) === "full" };
}
