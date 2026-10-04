import {
  ComponentStatus,
  HistoryCellStatus,
  Incident,
  OverallStatus,
  StatusComponent,
  SystemStatusSnapshot,
} from "../types";
import { generateUnifiedIncidentId } from "../incidents/ids";
import {
  componentIdsOf,
  incidentCoversDate,
  isMaintenance,
  isMajor,
  isOpen,
  normalizeId,
  resolvedAtOf,
} from "../incidents/utils";

export type CellOverrides = Map<string, { status: HistoryCellStatus; uptime: number }>;

export interface ReconcileOptions {
  overrides?: CellOverrides;
  nowMs?: number;
  refreshStatuses?: boolean;
}

const DEGRADED_STATUSES: ComponentStatus[] = ["major_outage", "degraded_performance", "partial_outage"];

const clampUptime = (value: number | null, min: number, max: number, fallback: number): number =>
  typeof value === "number" && value >= min && value < max ? value : fallback;

const roundTo2 = (value: number): number => parseFloat(value.toFixed(2));

function deriveComponentStatus(current: ComponentStatus, open: Incident[]): ComponentStatus {
  if (open.length > 0) return open.some(isMajor) ? "major_outage" : "degraded_performance";
  return DEGRADED_STATUSES.includes(current) ? "operational" : current;
}

function paintHistory(
  component: StatusComponent,
  incidents: Incident[],
  overrides: CellOverrides | undefined,
  nowMs: number,
): void {
  for (const cell of component.history90d ?? []) {
    if (cell.status === "nodata" && cell.uptime === null) continue;

    const override = overrides?.get(`${component.id}:${cell.date}`);
    if (override) {
      cell.status = override.status;
      cell.uptime = override.uptime;
      continue;
    }

    const covering = incidents.filter((inc) => incidentCoversDate(inc, cell.date, nowMs));
    if (covering.length === 0) {
      if (cell.status !== "nodata") {
        cell.status = "operational";
        cell.uptime = 100;
      }
    } else if (covering.some(isMajor)) {
      cell.status = "outage";
      cell.uptime = clampUptime(cell.uptime, -Infinity, 90, 90);
    } else {
      cell.status = "degraded";
      cell.uptime = clampUptime(cell.uptime, 90, 100, 98);
    }
  }
}

function averageUptime(component: StatusComponent): number {
  const tracked = (component.history90d ?? []).filter(
    (cell) => cell.status !== "nodata" && typeof cell.uptime === "number",
  );
  return tracked.length > 0 ? roundTo2(tracked.reduce((sum, cell) => sum + (cell.uptime as number), 0) / tracked.length) : 100;
}

function deriveOverallStatus(coreComponents: StatusComponent[]): OverallStatus {
  if (coreComponents.some((c) => c.status === "major_outage")) return "major_outage";
  const isDegraded = coreComponents.some((c) => c.status === "degraded_performance" || c.status === "partial_outage");
  return isDegraded ? "degraded" : "operational";
}

function countActiveIncidents(incidents: Incident[], overallStatus: OverallStatus): number {
  return incidents.filter(
    (inc) =>
      isOpen(inc) &&
      !isMaintenance(inc) &&
      !(overallStatus === "operational" && componentIdsOf(inc).some((c) => c.startsWith("upstream_"))),
  ).length;
}

export function reconcileSnapshotHistory(
  snapshot: SystemStatusSnapshot,
  { overrides, nowMs = Date.now(), refreshStatuses = true }: ReconcileOptions = {},
): SystemStatusSnapshot {
  if (!snapshot) return snapshot;
  snapshot.components ??= [];
  const incidents = (snapshot.incidents ?? []).filter(Boolean).map((inc) => ({
    ...inc,
    id: normalizeId(inc.id) || generateUnifiedIncidentId(inc.createdAt),
    resolvedAt: resolvedAtOf(inc),
  }));
  snapshot.incidents = incidents;

  for (const component of snapshot.components) {
    const related = incidents.filter((inc) => !isMaintenance(inc) && componentIdsOf(inc).includes(component.id));
    if (refreshStatuses) component.status = deriveComponentStatus(component.status, related.filter(isOpen));
    paintHistory(component, related, overrides, nowMs);
    component.uptime90d = averageUptime(component);
  }

  const coreComponents = snapshot.components.filter((c) => c.group === "core_services");
  if (refreshStatuses && snapshot.summary.overallStatus !== "maintenance") {
    snapshot.summary.overallStatus = deriveOverallStatus(coreComponents);
  }
  snapshot.summary.activeIncidentsCount = countActiveIncidents(incidents, snapshot.summary.overallStatus);

  const ratioTargets = coreComponents.length > 0 ? coreComponents : snapshot.components;
  snapshot.summary.rolling90dRatio = roundTo2(
    ratioTargets.reduce((sum, c) => sum + (c.uptime90d ?? 100), 0) / Math.max(ratioTargets.length, 1),
  );

  return snapshot;
}
