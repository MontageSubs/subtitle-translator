import { HistoryCellStatus, SystemStatusSnapshot } from "../types";
import { CellOverrides, reconcileSnapshotHistory } from "./reconcile";

const OUTAGE_ALIASES = ["outage", "partial_outage", "major_outage"];
const DEGRADED_ALIASES = ["degraded", "degraded_performance"];
const NODATA_ALIASES = ["nodata", "no_data"];

const DEFAULT_UPTIME: Record<HistoryCellStatus, number> = {
  operational: 100,
  degraded: 98,
  outage: 90,
  nodata: 90,
};

function toCellStatus(status?: string): HistoryCellStatus {
  if (status && DEGRADED_ALIASES.includes(status)) return "degraded";
  if (status && OUTAGE_ALIASES.includes(status)) return "outage";
  if (status && NODATA_ALIASES.includes(status)) return "nodata";
  return "operational";
}

export function deleteSnapshotFromSnapshot(
  snapshot: SystemStatusSnapshot,
  date: string,
  componentId?: string,
): SystemStatusSnapshot {
  if (!date || !snapshot.components) return snapshot;

  for (const component of snapshot.components) {
    if (componentId && component.id !== componentId) continue;
    const cell = component.history90d?.find((h) => h.date === date);
    if (cell) {
      cell.status = "operational";
      cell.uptime = 100.0;
    }
  }
  return reconcileSnapshotHistory(snapshot);
}

export function upsertSnapshotInSnapshot(
  snapshot: SystemStatusSnapshot,
  params: { date: string; componentId: string; status?: string; uptimeRatio?: number },
): SystemStatusSnapshot {
  if (!params.date || !params.componentId || !snapshot.components) return snapshot;

  const component = snapshot.components.find((c) => c.id === params.componentId);
  if (!component) return snapshot;

  const status = toCellStatus(params.status);
  const uptime =
    params.uptimeRatio !== undefined && !isNaN(params.uptimeRatio) ? params.uptimeRatio : DEFAULT_UPTIME[status];

  component.history90d ??= [];
  const existing = component.history90d.find((h) => h.date === params.date);
  if (existing) {
    existing.status = status;
    existing.uptime = uptime;
  } else {
    component.history90d.push({ date: params.date, status, uptime });
    component.history90d.sort((a, b) => a.date.localeCompare(b.date));
  }

  const overrides: CellOverrides = new Map([[`${params.componentId}:${params.date}`, { status, uptime }]]);
  return reconcileSnapshotHistory(snapshot, { overrides });
}
