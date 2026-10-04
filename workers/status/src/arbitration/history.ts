import { ComponentHistoryEntry, ComponentStatus, StatusComponent, classifyDailyUptime } from "../types";
import { COMPONENT_DEFINITIONS } from "./components";

const DAY_MS = 86_400_000;

export interface DailySnapshotRecord {
  componentId: string;
  status: string;
  uptimeRatio: number;
  totalEvents: number;
  failureEvents: number;
}

export interface HistoryInputs {
  componentStatusMap: Record<string, ComponentStatus>;
  historyMap: Map<string, ComponentHistoryEntry[]>;
  nowUtc: Date;
  firstSeenDate: string;
  retentionDays: number;
}

const roundTo2 = (value: number): number => parseFloat(value.toFixed(2));

const failureWeightOf = (status: ComponentStatus): number => {
  if (status === "major_outage") return 1;
  return status === "degraded_performance" || status === "partial_outage" ? 0.5 : 0;
};

function listRetentionDates(nowUtc: Date, retentionDays: number): string[] {
  return Array.from({ length: retentionDays }, (_, index) => {
    const date = new Date(nowUtc);
    date.setUTCDate(date.getUTCDate() - (retentionDays - 1 - index));
    return date.toISOString().slice(0, 10);
  });
}

function averageTrackedUptime(history: ComponentHistoryEntry[]): number {
  const tracked = history.filter((h) => h.status !== "nodata" && typeof h.uptime === "number");
  return tracked.length > 0 ? roundTo2(tracked.reduce((sum, h) => sum + (h.uptime as number), 0) / tracked.length) : 100.0;
}

export function buildComponents(inputs: HistoryInputs): {
  components: StatusComponent[];
  dailySnapshots: DailySnapshotRecord[];
} {
  const { componentStatusMap, historyMap, nowUtc, firstSeenDate, retentionDays } = inputs;
  const today = nowUtc.toISOString().slice(0, 10);
  const retentionDates = listRetentionDates(nowUtc, retentionDays);
  const dailySnapshots: DailySnapshotRecord[] = [];

  const components = COMPONENT_DEFINITIONS.map((definition): StatusComponent => {
    const status = componentStatusMap[definition.id] || "operational";
    const knownHistory = new Map((historyMap.get(definition.id) || []).map((h) => [h.date, h]));

    const priorToday = knownHistory.get(today);
    const todayTotal = (priorToday?.totalEvents ?? 0) + 1;
    const todayFailures = (priorToday?.failureEvents ?? 0) + failureWeightOf(status);
    const todayUptime = roundTo2(100 * ((todayTotal - todayFailures) / todayTotal));
    const todayCellStatus = classifyDailyUptime(todayUptime);

    const history90d: ComponentHistoryEntry[] = retentionDates.map((date) => {
      if (date === today) return { date, status: todayCellStatus, uptime: todayUptime };
      const known = knownHistory.get(date);
      if (known) return { date, status: known.status, uptime: known.uptime };
      return date >= firstSeenDate ? { date, status: "operational", uptime: 100 } : { date, status: "nodata", uptime: null };
    });

    if (todayFailures > 0) {
      dailySnapshots.push({
        componentId: definition.id,
        status: todayCellStatus,
        uptimeRatio: todayUptime,
        totalEvents: todayTotal,
        failureEvents: todayFailures,
      });
    }

    return { ...definition, status, uptime90d: averageTrackedUptime(history90d), history90d };
  });

  return { components, dailySnapshots };
}

export function computeOverall90dRatio(components: StatusComponent[]): number {
  const core = components.filter((c) => c.group === "core_services");
  return roundTo2(core.reduce((sum, c) => sum + c.uptime90d, 0) / Math.max(core.length, 1));
}

export function computeTrackedDays(nowUtc: Date, firstSeenDate: string, retentionDays: number): number {
  const elapsedDays = Math.floor((nowUtc.getTime() - Date.parse(`${firstSeenDate}T00:00:00Z`)) / DAY_MS) + 1;
  return Math.max(1, Math.min(retentionDays, elapsedDays));
}
