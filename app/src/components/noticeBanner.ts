import { t } from "../i18n";
import { STATUS_URL } from "../config/config";
import { fetchStatusSnapshot, activeIncidents } from "../api/statusApi";
import { publishEngineHealth } from "../api/engineHealth";
import { readHotAnnouncement, refreshHotAnnouncement } from "../api/announcementFeed";
import { ANNOUNCEMENT_SLUG } from "../config/announcement";
import { buildPath } from "../router/router";
import type { LocaleCode } from "../i18n";
import { renderNoticeBanner, NoticeItem, NOTICE_BANNER_ID, NOTICE_DISMISS_KEY } from "../render/noticeBannerMarkup";
import { primeNoticeBanner } from "../utils/noticeMarquee";
import { announceUpdateIfAvailable, reportMinClientVersion, reportUnreadableFormat } from "../update/updateWatcher";

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
let baseline: Notice = EMPTY_NOTICE;
let hot: Notice = EMPTY_NOTICE;
let announcementLocale = "";
let incidents: Notice = EMPTY_NOTICE;
let announcementSettled = false;
let polling = false;
let ticker: ReturnType<typeof setInterval> | undefined;
let incompatibleStreak = 0;

function currentBanner(): HTMLElement | null {
  return document.getElementById(NOTICE_BANNER_ID);
}

function hotNoticeOf(locale: string): Notice {
  const stored = readHotAnnouncement(locale);
  if (!stored?.items.length) return EMPTY_NOTICE;
  const href = buildPath(locale as LocaleCode, "docs", [ANNOUNCEMENT_SLUG]);
  const label = t("notice.readMore");
  return { items: stored.items.map((item) => ({ ...item, href, label })), batchId: stored.id };
}

function render(): void {
  const announcement = hot.items.length ? hot : baseline;
  const items = [...announcement.items, ...incidents.items];
  const batchId = [announcement.batchId, incidents.batchId].filter(Boolean).join("|");
  const existing = currentBanner();
  if (existing && !announcementSettled && !announcement.items.length) return;
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

async function refreshAnnouncement(): Promise<void> {
  const locale = announcementLocale;
  if (!locale) return;
  const { reachable, changed } = await refreshHotAnnouncement(locale);
  if (locale !== announcementLocale || !reachable) return;
  announcementSettled = true;
  if (!changed) {
    render();
    return;
  }
  hot = hotNoticeOf(locale);
  render();
  void announceUpdateIfAvailable();
}

export function setAnnouncementNotice(notice: Notice | null, locale: string): void {
  const localeChanged = locale !== announcementLocale;
  if (localeChanged) announcementSettled = false;
  baseline = notice ?? EMPTY_NOTICE;
  announcementLocale = locale;
  hot = hotNoticeOf(locale);
  render();
  if (localeChanged && polling) void refreshAnnouncement();
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
  publishEngineHealth(result.snapshot);
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
    void refreshAnnouncement();
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
