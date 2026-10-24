import { t } from "../../i18n";
import { clearHistory } from "../../lib/history/history";
import { CLEAR_ALL_KEY, DELETION_UNDO_WINDOW_MS, cancelDeletion, deletionRemainingMs, queueDeletion } from "../../lib/history/deletionQueue";
import { TRASH_ICON, UNDO_ICON } from "../../render/icons";
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

  const clearControl = mountConfirmButton({
    button: query<HTMLButtonElement>("#history-clear"),
    label: query<HTMLElement>("#history-clear-label"),
    idleText: () => t("history.clearAll"),
    confirmText: () => t("history.confirmClear"),
    icons: { idle: TRASH_ICON, undo: UNDO_ICON },
    onConfirm: () => {
      queueDeletion(CLEAR_ALL_KEY, DELETION_UNDO_WINDOW_MS, clearHistory);
      return onChanged();
    },
    undo: {
      text: (seconds) => t("common.undoCountdown", { seconds }),
      windowMs: DELETION_UNDO_WINDOW_MS,
      applyImmediately: true,
      onCancel: () => {
        cancelDeletion(CLEAR_ALL_KEY);
        void onChanged();
      },
    },
    signal,
  });
  const remainingMs = deletionRemainingMs(CLEAR_ALL_KEY);
  if (remainingMs > 0) clearControl.resumePending(remainingMs);
}
