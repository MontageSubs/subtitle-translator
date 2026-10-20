import { t, getLocale } from "../../i18n";
import { getCachedDisplayStats, refreshDisplayStats, Stats } from "../../api/remoteStats";
import { countLocalHistoryJobs } from "../../lib/history/history";
import { formatCompactNumber } from "../../utils/localeFormat";
import type { WorkspaceContext } from "./context";

export interface StatsHandle {
  refreshLocalCount(): void;
}

function formatStatsLine(stats: Stats): string {
  const locale = getLocale();
  return t("stats.line", { total: formatCompactNumber(stats.total, locale), last24h: formatCompactNumber(stats.last24h, locale) });
}

export function mountStats(ctx: WorkspaceContext): StatsHandle {
  const remoteLine = ctx.query<HTMLElement>("#stats-line");
  const localLine = ctx.query<HTMLElement>("#local-stats-line");

  const cached = getCachedDisplayStats();
  if (cached) remoteLine.textContent = formatStatsLine(cached);
  refreshDisplayStats()
    .then((stats) => { if (stats) remoteLine.textContent = formatStatsLine(stats); })
    .catch(() => { if (!cached) remoteLine.textContent = ""; });

  function refreshLocalCount(): void {
    countLocalHistoryJobs()
      .then((count) => { localLine.textContent = count ? t("stats.local", { count }) : ""; })
      .catch(() => {});
  }

  refreshLocalCount();
  return { refreshLocalCount };
}
