import { t, getLocale } from "../../i18n";
import { getCachedDisplayStats, refreshDisplayStats, Stats } from "../../api/remoteStats";
import { countLocalHistoryJobs } from "../../lib/history/history";
import { onHistoryChange } from "../../lib/history/historyChange";
import { formatCompactNumber } from "../../utils/localeFormat";
import { runUnlessConserving } from "../../update/resourceSaving";
import type { WorkspaceContext } from "./context";

const STATS_DEFERRAL_MS = 800;

function formatStatsLine(stats: Stats): string {
  const locale = getLocale();
  return t("stats.line", { total: formatCompactNumber(stats.total, locale), last24h: formatCompactNumber(stats.last24h, locale) });
}

export function mountStats(ctx: WorkspaceContext): void {
  const remoteLine = ctx.query<HTMLElement>("#stats-line");
  const localLine = ctx.query<HTMLElement>("#local-stats-line");

  const cached = getCachedDisplayStats();
  if (cached) remoteLine.textContent = formatStatsLine(cached);
  const refreshRemoteLine = (): Promise<void> =>
    refreshDisplayStats()
      .then((stats) => { if (stats) remoteLine.textContent = formatStatsLine(stats); })
      .catch(() => { if (!cached) remoteLine.textContent = ""; });
  const deferred = (task: () => void): void => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(task, { timeout: STATS_DEFERRAL_MS });
    else setTimeout(task, STATS_DEFERRAL_MS);
  };
  if (cached) deferred(() => void runUnlessConserving(refreshRemoteLine));
  else deferred(() => void refreshRemoteLine());

  function refreshLocalCount(): void {
    countLocalHistoryJobs()
      .then((count) => { localLine.textContent = count ? t("stats.local", { count }) : ""; })
      .catch(() => {});
  }

  refreshLocalCount();
  onHistoryChange(refreshLocalCount, ctx.signal);
}
