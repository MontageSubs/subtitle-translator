import { scopedQuery } from "../utils/dom";
import { t } from "../i18n";
import { formatFrontendLog } from "../utils/logger";

export interface LogPanelHandle {
  append(message: string): void;
  clear(): void;
  setError(active: boolean): void;
}

export function mountLogPanel(container: HTMLElement): LogPanelHandle {
  const query = scopedQuery(container);
  const logEl = query<HTMLElement>("#log");
  const logDetails = query<HTMLDetailsElement>("#log-details");
  const logSummary = query<HTMLElement>("#log-summary");
  const logSummaryText = query<HTMLElement>("#log-summary-text");

  const ALERT_PATTERN = /\[ERROR\]|\[WARN\]/i;
  let recordsCount = 0;
  let errorsCount = 0;
  let lastLine = "";

  function append(message: string): void {
    const formatted = formatFrontendLog(message);
    if (!formatted) return;
    if (formatted === lastLine) return;
    lastLine = formatted;
    recordsCount++;
    if (ALERT_PATTERN.test(formatted)) errorsCount++;
    logDetails.hidden = false;
    logSummaryText.textContent = t("log.summary", { records: recordsCount, errors: errorsCount });
    logEl.textContent += `${formatted}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clear(): void {
    recordsCount = 0;
    errorsCount = 0;
    lastLine = "";
    logEl.textContent = "";
    logDetails.hidden = true;
    logDetails.open = false;
    logSummaryText.textContent = t("log.expand");
  }

  function setError(active: boolean): void {
    logSummary.classList.toggle("task-disclosure__summary--error", active);
    if (!active) return;
    logDetails.hidden = false;
    logDetails.open = true;
  }

  return { append, clear, setError };
}
