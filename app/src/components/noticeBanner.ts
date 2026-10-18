import { t } from "../i18n";
import { STATUS_URL } from "../config/config";
import { fetchStatusSnapshot, activeIncidents } from "../api/statusApi";
import { renderNoticeBanner, NoticeItem, NOTICE_BANNER_ID, NOTICE_DISMISS_KEY } from "../render/noticeBannerMarkup";
import { primeNoticeBanner } from "../utils/noticeMarquee";
import { reportMinClientVersion, reportUnreadableFormat } from "../update/updateWatcher";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const TICK_MS = 10_000;
const MAX_INCOMPATIBLE_STREAK = 2;
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
let ticker: ReturnType<typeof setInterval> | undefined;
let incompatibleStreak = 0;

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
    newTabLabel: t("a11y.opensInNewTab"),
    ariaLabel: t("shell.announcementLabel"),
  }).trim();
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) existing.outerHTML = html;
  else host?.insertAdjacentHTML("beforebegin", html);
  const banner = currentBanner();
  if (banner) primeNoticeBanner(banner, NOTICE_DISMISS_KEY);
}

export function setAnnouncementNotice(notice: Notice | null): void {
  announcement = notice ?? EMPTY_NOTICE;
  render();
}

async function refreshIncidents(): Promise<void> {
  const result = await fetchStatusSnapshot();
  if (result.kind === "unreachable") return;
  if (result.kind === "incompatible") {
    reportUnreadableFormat("status");
    if (++incompatibleStreak >= MAX_INCOMPATIBLE_STREAK) clearInterval(ticker);
    return;
  }
  incompatibleStreak = 0;
  reportMinClientVersion("status", result.snapshot.minClientVersion);
  const active = activeIncidents(result.snapshot);
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
    ticker = setInterval(tick, TICK_MS);
  };

  const idle = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(start);
  else setTimeout(start, 1000);
}
