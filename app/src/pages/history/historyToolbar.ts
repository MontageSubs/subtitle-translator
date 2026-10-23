import { t } from "../../i18n";
import { clearHistory } from "../../lib/history/history";
import { importHistoryBackup } from "../../lib/history/historyBackup";
import { mountConfirmButton } from "../../components/confirmButton";
import { showToastMessage } from "../../components/updateToast";
import { announceUpdateIfAvailable } from "../../update/updateWatcher";
import type { ScopedQuery } from "../../utils/dom";
import { downloadHistoryBackup } from "./exports";

export function mountHistoryToolbar(query: ScopedQuery, onChanged: () => Promise<void>, signal: AbortSignal): void {
  const importInput = query<HTMLInputElement>("#history-import-input");

  query("#history-export-btn").addEventListener("click", () => { void downloadHistoryBackup(); }, { signal });
  query("#history-import-btn").addEventListener("click", () => {
    importInput.value = "";
    importInput.click();
  }, { signal });
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const { imported, updated, unreadable, skipped } = await importHistoryBackup(file);
      if (skipped) showToastMessage(t("error.historyLimitSkipped", { count: skipped }), 8000);
      if (unreadable) {
        showToastMessage(t("error.newerHistoryRecords"), 8000);
        void announceUpdateIfAvailable();
      } else if (!imported && !updated && !skipped) {
        showToastMessage(t("error.invalidHistoryBackup"));
      }
      if (imported || updated) await onChanged();
    } catch {
      showToastMessage(t("error.invalidHistoryBackup"));
    }
  }, { signal });

  mountConfirmButton({
    button: query<HTMLButtonElement>("#history-clear"),
    label: query<HTMLElement>("#history-clear-label"),
    idleText: () => t("history.clearAll"),
    confirmText: () => t("history.confirmClear"),
    onConfirm: () => clearHistory().then(onChanged),
    undo: { text: () => t("common.undo") },
    signal,
  });
}
