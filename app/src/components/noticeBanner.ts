import { t } from "../i18n";
import { STATUS_URL } from "../config/config";
import { fetchStatusSnapshot, activeIncidents } from "../api/statusApi";
import { renderNoticeBanner, NoticeItem, NOTICE_BANNER_ID } from "../render/noticeBannerMarkup";
import { primeNoticeBanner } from "../utils/noticeMarquee";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const TICK_MS = 10_000;
const DISMISS_KEY = "subtitle-translator:notice-dismissed-id";
const CRITICAL_SEVERITIES = new Set(["critical", "major"]);

interface Notice {
  items: NoticeItem[];
  batchId: string;
}

const EMPTY_NOTICE: Notice = { items: [], batchId: "" };

let host: HTMLElement | null = null;
let announcement: Notice = EMPTY_NOTICE;
let incidents: Notice = EMPTY_NOTICE;
let polling = false;

function currentBanner(): HTMLElement | null {
  return document.getElementById(NOTICE_BANNER_ID);
}

function render(): void {
  const items = [...announcement.items, ...incidents.items];
  const batchId = [announcement.batchId, incidents.batchId].filter(Boolean).join("|");
  const existing = currentBanner();
  const html = renderNoticeBanner({
    id: NOTICE_BANNER_ID,
    items,
    batchId,
    dismissLabel: t("notice.dismiss"),
    ariaLabel: t("shell.announcementLabel"),
  }).trim();
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) existing.outerHTML = html;
  else host?.insertAdjacentHTML("beforebegin", html);
  const banner = currentBanner();
  if (banner) primeNoticeBanner(banner, DISMISS_KEY);
}

export function setAnnouncementNotice(notice: Notice | null): void {
  announcement = notice ?? EMPTY_NOTICE;
  render();
}

async function refreshIncidents(): Promise<void> {
  const snapshot = await fetchStatusSnapshot();
  if (!snapshot) return;
  const active = activeIncidents(snapshot);
  incidents = {
    items: active.map(({ title, severity }): NoticeItem => ({
      tone: CRITICAL_SEVERITIES.has(severity) ? "critical" : "warning",
      text: title,
      href: STATUS_URL,
      label: t("status.viewPage"),
      external: true,
    })),
    batchId: active.map((incident) => incident.id).sort().join(","),
  };
  render();
}

export function mountNoticeBanner(anchor: HTMLElement): void {
  host = anchor;
  if (polling) return;
  polling = true;

  let foregroundElapsedMs = 0;
  const check = (): void => {
    foregroundElapsedMs = 0;
    void refreshIncidents();
  };
  const tick = (): void => {
    if (document.visibilityState !== "visible") return;
    foregroundElapsedMs += TICK_MS;
    if (foregroundElapsedMs >= CHECK_INTERVAL_MS) check();
  };
  const start = (): void => {
    check();
    setInterval(tick, TICK_MS);
  };

  const idle = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(start);
  else setTimeout(start, 1000);
}
