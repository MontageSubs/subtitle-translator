import { ComponentHistoryEntry, ComponentStatus, StatusComponent } from "../types";
import { COMPONENT_DEFINITIONS } from "./components";

const DAY_MS = 86_400_000;

export interface HistoryInputs {
  componentStatusMap: Record<string, ComponentStatus>;
  nowUtc: Date;
  firstSeenDate: string;
  retentionDays: number;
}

const roundTo2 = (value: number): number => parseFloat(value.toFixed(2));

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

export function buildComponents({ componentStatusMap, nowUtc, firstSeenDate, retentionDays }: HistoryInputs): StatusComponent[] {
  const retentionDates = listRetentionDates(nowUtc, retentionDays);
  return COMPONENT_DEFINITIONS.map((definition): StatusComponent => {
    const history90d = retentionDates.map(
      (date): ComponentHistoryEntry =>
        date >= firstSeenDate ? { date, status: "operational", uptime: 100 } : { date, status: "nodata", uptime: null },
    );
    return { ...definition, status: componentStatusMap[definition.id] || "operational", uptime90d: averageTrackedUptime(history90d), history90d };
  });
}

export function computeOverall90dRatio(components: StatusComponent[]): number {
  const core = components.filter((c) => c.group === "core_services");
  return roundTo2(core.reduce((sum, c) => sum + c.uptime90d, 0) / Math.max(core.length, 1));
}

export function computeTrackedDays(nowUtc: Date, firstSeenDate: string, retentionDays: number): number {
  const elapsedDays = Math.floor((nowUtc.getTime() - Date.parse(`${firstSeenDate}T00:00:00Z`)) / DAY_MS) + 1;
  return Math.max(1, Math.min(retentionDays, elapsedDays));
}
