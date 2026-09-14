import { t } from "../i18n";
import { formatFrontendLog } from "../utils/logger";

export interface LogPanelHandle {
  append(message: string): void;
  clear(): void;
  setError(active: boolean): void;
}

export function mountLogPanel(container: HTMLElement): LogPanelHandle {
  const q = <T extends HTMLElement>(selector: string) => container.querySelector(selector) as T;
  const logEl = q<HTMLElement>("#log");
  const logDetails = q<HTMLDetailsElement>("#log-details");
  const logSummary = q<HTMLElement>("#log-summary");
  const logSummaryText = q<HTMLElement>("#log-summary-text");

  let recordsCount = 0;
  let errorsCount = 0;

  function append(message: string): void {
    const formatted = formatFrontendLog(message);
    if (!formatted) return;
    const currentLogs = logEl.textContent ? logEl.textContent.trim().split("\n") : [];
    if (currentLogs.length > 0 && currentLogs[currentLogs.length - 1] === formatted) {
      return;
    }
    recordsCount++;
    if (/\[ERROR\]|\[WARN\]/i.test(formatted)) {
      errorsCount++;
    }
    logDetails.hidden = false;
    logSummaryText.textContent = t("log.summary", { records: recordsCount, errors: errorsCount });
    logEl.textContent += `${formatted}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clear(): void {
    recordsCount = 0;
    errorsCount = 0;
    logEl.textContent = "";
    logDetails.hidden = true;
    logDetails.open = false;
    logSummaryText.textContent = t("log.expand");
  }

  function setError(active: boolean): void {
    if (active) {
      logDetails.hidden = false;
      logDetails.open = true;
      logSummary.classList.add("task-disclosure__summary--error");
    } else {
      logSummary.classList.remove("task-disclosure__summary--error");
    }
  }

  return { append, clear, setError };
}
