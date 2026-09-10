import { t } from "../i18n";
import { STATUS_URL } from "../config/config";
import { fetchStatusSnapshot, activeIncidents, highestSeverity, StatusIncident } from "../api/statusApi";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DISMISS_KEY = "subtitle-translator:status-banner-dismissed-id";

function incidentMessage(incident: StatusIncident): string {
  const latest = incident.updates[incident.updates.length - 1];
  return latest ? `${incident.title} — ${latest.body}` : incident.title;
}

function isCritical(severity: string): boolean {
  return severity === "critical" || severity === "major";
}

function dismissedId(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function setDismissedId(id: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, id);
  } catch {
    return;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let currentContainer: HTMLElement | null = null;
let started = false;
let lastIncidents: StatusIncident[] = [];

export function mountStatusBanner(container: HTMLElement): void {
  currentContainer = container;
  render(lastIncidents);

  if (started) return;
  started = true;

  let timer: ReturnType<typeof setInterval> | undefined;

  async function check(): Promise<void> {
    const snapshot = await fetchStatusSnapshot();
    lastIncidents = activeIncidents(snapshot);
    render(lastIncidents);
  }

  function syncForeground(): void {
    if (document.visibilityState !== "visible") {
      if (timer !== undefined) { clearInterval(timer); timer = undefined; }
      return;
    }
    if (timer === undefined) {
      check();
      timer = setInterval(check, CHECK_INTERVAL_MS);
    }
  }

  const idle = (window as any).requestIdleCallback as ((cb: () => void) => void) | undefined;
  if (idle) idle(() => syncForeground());
  else setTimeout(() => syncForeground(), 1000);
  document.addEventListener("visibilitychange", syncForeground);
}

function render(incidents: StatusIncident[]): void {
  const container = currentContainer;
  if (!container) return;
  if (!incidents.length) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }
  const batchId = incidents.map((i) => i.id).sort().join(",");
  if (dismissedId() === batchId) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }
  const tone = isCritical(highestSeverity(incidents)) ? "critical" : "warning";
  container.hidden = false;
  container.innerHTML = `
    <div class="status-banner status-banner--${tone}">
      <div class="status-banner__track">
        <div class="status-banner__scroll">
          ${incidents.concat(incidents).map((incident) => `
            <span class="status-banner__item">
              <span class="status-banner__dot status-banner__dot--${isCritical(incident.severity) ? "critical" : "warning"}"></span>
              <span>${escapeHtml(incidentMessage(incident))}</span>
            </span>
          `).join("")}
        </div>
      </div>
      <a class="status-banner__link" href="${STATUS_URL}" target="_blank" rel="noopener">${t("status.viewPage")}</a>
      <button type="button" class="status-banner__dismiss" aria-label="${t("status.dismiss")}">&times;</button>
    </div>
  `;
  container.querySelector<HTMLButtonElement>(".status-banner__dismiss")?.addEventListener("click", () => {
    setDismissedId(batchId);
    container.innerHTML = "";
    container.hidden = true;
  });
}
