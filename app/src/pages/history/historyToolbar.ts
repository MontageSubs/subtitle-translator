import { t } from "../../i18n";
import { clearHistory, importHistoryJson } from "../../lib/history/history";
import { mountConfirmButton } from "../../components/confirmButton";
import { showToastMessage } from "../../components/updateToast";
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
      const result = await importHistoryJson(await file.text());
      if (!result || (result.imported === 0 && result.updated === 0)) showToastMessage(t("error.invalidHistoryBackup"));
      else await onChanged();
    } catch {
      showToastMessage(t("error.invalidHistoryBackup"));
    }
  }, { signal });

  mountConfirmButton({
    button: query<HTMLButtonElement>("#history-clear"),
    label: query<HTMLElement>("#history-clear-label"),
    idleText: () => t("history.clearAll"),
    confirmText: () => t("history.confirmClear"),
    onConfirm: () => { void clearHistory().then(onChanged); },
    signal,
  });
}
