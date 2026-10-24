import { t } from "../i18n";
import { STATUS_URL } from "../config/config";
import { fetchStatusSnapshot, activeIncidents } from "../api/statusApi";
import { publishEngineHealth } from "../api/engineHealth";
import { ANNOUNCEMENT_CHANGED_EVENT, checkAnnouncement, readAnnouncement } from "../api/announcementFeed";
import { ANNOUNCEMENT_SLUG } from "../config/announcement";
import { APP_VERSION } from "../config/compat";
import { matchesVersionRange } from "../utils/versionRange";
import { buildPath } from "../router/router";
import type { LocaleCode } from "../i18n";
import { renderNoticeBanner, NoticeItem, NOTICE_BANNER_ID, NOTICE_DISMISS_KEY } from "../render/noticeBannerMarkup";
import { primeNoticeBanner } from "../utils/noticeMarquee";
import { runUnlessConserving } from "../update/resourceSaving";
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
let announcementNotice: Notice = EMPTY_NOTICE;
let bannerLocale = "";
let incidents: Notice = EMPTY_NOTICE;
let announcementSettled = false;
let polling = false;
let ticker: ReturnType<typeof setInterval> | undefined;
let incompatibleStreak = 0;

function currentBanner(): HTMLElement | null {
  return document.getElementById(NOTICE_BANNER_ID);
}

function announcementNoticeOf(locale: string): Notice {
  const announcement = readAnnouncement(locale);
  if (!announcement?.banner || !matchesVersionRange(announcement.banner.versions, APP_VERSION)) return EMPTY_NOTICE;
  const href = buildPath(locale as LocaleCode, "docs", [ANNOUNCEMENT_SLUG]);
  return {
    items: [{ tone: announcement.banner.tone, text: announcement.title, href, label: t("notice.readMore") }],
    batchId: announcement.bannerId ?? "",
  };
}

function render(): void {
  const items = [...announcementNotice.items, ...incidents.items];
  const batchId = [announcementNotice.batchId, incidents.batchId].filter(Boolean).join("|");
  const existing = currentBanner();
  if (existing && !announcementSettled && !announcementNotice.items.length) return;
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
  const locale = bannerLocale;
  if (!locale) return;
  const reachable = await checkAnnouncement(locale);
  if (locale !== bannerLocale || !reachable) return;
  announcementSettled = true;
  announcementNotice = announcementNoticeOf(locale);
  render();
}

export function setBannerLocale(locale: string): void {
  if (locale === bannerLocale) return;
  bannerLocale = locale;
  announcementSettled = false;
  announcementNotice = announcementNoticeOf(locale);
  render();
  if (polling) void refreshAnnouncement();
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
      tone: CRITICAL_SEVERITIES.has(severity) ? "red" : "yellow",
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
  window.addEventListener(ANNOUNCEMENT_CHANGED_EVENT, () => {
    announcementNotice = announcementNoticeOf(bannerLocale);
    render();
  });

  let foregroundElapsedMs = 0;
  const tick = (): void => {
    if (document.visibilityState !== "visible") return;
    foregroundElapsedMs += TICK_MS;
    if (foregroundElapsedMs < CHECK_INTERVAL_MS) return;
    foregroundElapsedMs = 0;
    void runUnlessConserving(() => {
      void refreshIncidents();
      void refreshAnnouncement();
    });
  };
  const start = (): void => {
    void refreshIncidents();
    void refreshAnnouncement();
    ticker = setInterval(tick, TICK_MS);
  };

  const idle = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(start);
  else setTimeout(start, 1000);
}
