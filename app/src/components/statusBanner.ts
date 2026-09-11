import { t } from "../i18n";
import { STATUS_URL } from "../config/config";
import { fetchStatusSnapshot, activeIncidents, highestSeverity, StatusIncident } from "../api/statusApi";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const TICK_MS = 10_000;
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

  let foregroundElapsedMs = 0;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let checkInFlight = false;

  async function check(): Promise<void> {
    if (checkInFlight) return;
    checkInFlight = true;
    foregroundElapsedMs = 0;
    const snapshot = await fetchStatusSnapshot();
    lastIncidents = activeIncidents(snapshot);
    render(lastIncidents);
    checkInFlight = false;
  }

  function tick(): void {
    if (document.visibilityState !== "visible") return;
    foregroundElapsedMs += TICK_MS;
    if (foregroundElapsedMs >= CHECK_INTERVAL_MS) check();
  }

  function startTicking(): void {
    if (tickTimer !== undefined) return;
    tickTimer = setInterval(tick, TICK_MS);
  }

  const idle = (window as any).requestIdleCallback as ((cb: () => void) => void) | undefined;
  const firstLoad = () => { check(); startTicking(); };
  if (idle) idle(firstLoad);
  else setTimeout(firstLoad, 1000);
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
