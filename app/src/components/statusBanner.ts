import { t } from "../i18n";
import { STATUS_URL } from "../config/config";
import { fetchStatusSnapshot, activeIncidents, readCachedIncidents, writeCachedIncidents, StatusIncident } from "../api/statusApi";
import { renderNoticeBanner, NoticeItem } from "../render/noticeBannerMarkup";
import { primeNoticeBanner, isNoticeDismissed } from "../utils/noticeMarquee";

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

let currentContainer: HTMLElement | null = null;
let started = false;
let lastIncidents: StatusIncident[] = readCachedIncidents();

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
    if (snapshot) {
      lastIncidents = activeIncidents(snapshot);
      writeCachedIncidents(lastIncidents);
      render(lastIncidents);
    }
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
  const items: NoticeItem[] = incidents.map((incident) => ({
    tone: isCritical(incident.severity) ? "critical" : "warning",
    text: incidentMessage(incident),
  }));
  const batchId = incidents.map((i) => i.id).sort().join(",");
  if (isNoticeDismissed(DISMISS_KEY, batchId)) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.innerHTML = renderNoticeBanner({
    id: "status-banner",
    variant: "status",
    items,
    batchId,
    linkHref: STATUS_URL,
    linkLabel: t("status.viewPage"),
    linkExternal: true,
    dismissLabel: t("notice.dismiss"),
  });
  const banner = container.querySelector<HTMLElement>(".notice-banner");
  if (banner) primeNoticeBanner(banner, DISMISS_KEY);
}
