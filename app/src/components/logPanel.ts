import { scopedQuery } from "../utils/dom";
import { t } from "../i18n";
import { APP_VERSION } from "../config/compat";
import { formatFrontendLog } from "../utils/logger";

export interface LogChannel {
  append(message: string): void;
}

export interface LogPanelHandle extends LogChannel {
  section(title: string): LogChannel;
  clear(): void;
  setError(active: boolean): void;
}

interface LogSection {
  header: string | null;
  lines: string[];
  lastLine: string;
}

const reportHeader = (title: string): string => `== Report: ${title} · frontend v${APP_VERSION} ==`;

export function mountLogPanel(container: HTMLElement): LogPanelHandle {
  const query = scopedQuery(container);
  const logEl = query<HTMLElement>("#log");
  const logDetails = query<HTMLDetailsElement>("#log-details");
  const logSummary = query<HTMLElement>("#log-summary");
  const logSummaryText = query<HTMLElement>("#log-summary-text");

  const ALERT_PATTERN = /\[ERROR\]|\[WARN\]/i;
  let sections: LogSection[] = [];
  let recordsCount = 0;
  let errorsCount = 0;

  const createSection = (header: string | null): LogSection => {
    const section: LogSection = { header, lines: [], lastLine: "" };
    sections.push(section);
    return section;
  };

  function render(): void {
    logEl.textContent = sections
      .filter((section) => section.lines.length)
      .map((section) => `${section.header ? `${section.header}\n` : ""}${section.lines.join("\n")}\n`)
      .join("\n");
    logEl.scrollTop = logEl.scrollHeight;
  }

  function write(section: LogSection, message: string): void {
    const formatted = formatFrontendLog(message);
    if (!formatted || formatted === section.lastLine) return;
    section.lastLine = formatted;
    section.lines.push(formatted);
    recordsCount++;
    if (ALERT_PATTERN.test(formatted)) errorsCount++;
    logDetails.hidden = false;
    logSummaryText.textContent = t("log.summary", { records: recordsCount, errors: errorsCount });
    render();
  }

  const channelFor = (section: LogSection): LogChannel => ({ append: (message) => write(section, message) });

  const general = (): LogSection => sections.find((section) => section.header === null) ?? createSection(null);

  function clear(): void {
    sections = [];
    recordsCount = 0;
    errorsCount = 0;
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

  return {
    append: (message) => write(general(), message),
    section: (title) => channelFor(createSection(reportHeader(title))),
    clear,
    setError,
  };
}
