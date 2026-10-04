import { ComponentHistoryEntry, Incident, ProbeResult, SystemStatusSnapshot, WindowMetrics } from "../types";
import { MaintenanceEvaluationResult } from "../incidents/maintenance";
import { ProviderReport } from "../providers/index";
import { reconcileSnapshotHistory } from "../snapshot/reconcile";
import { STATUS_PAGE_VERSION } from "./components";
import { buildExternalReferences } from "./ecosystem";
import { DailySnapshotRecord, buildComponents, computeOverall90dRatio, computeTrackedDays } from "./history";
import { IncidentBook } from "./incidentBook";
import { reconcileIncidents } from "./incidentFlow";
import { deriveStatuses, sumGatewayErrors } from "./statuses";

export interface ArbitrationInputs {
  windowMetrics: WindowMetrics;
  dayWindowMetrics: WindowMetrics;
  historyMap: Map<string, ComponentHistoryEntry[]>;
  statusDistributionProbe: ProbeResult;
  providerReports: ProviderReport[];
  maintenanceResult?: MaintenanceEvaluationResult;
  existingIncidents?: Incident[];
  statusDistributionColdStart?: boolean;
  nowUtc: Date;
  statusUrl: string;
  firstSeenDate: string;
  retentionDays: number;
  purgeCutoffSec?: number;
}

export interface ArbitrationResult {
  snapshot: SystemStatusSnapshot;
  dailySnapshotsToPersist: DailySnapshotRecord[];
}

function computePast24hAvailability(dayMetrics: WindowMetrics): number {
  const gatewayErrors = sumGatewayErrors(dayMetrics);
  const totalOps = dayMetrics.totalJobs + gatewayErrors;
  return totalOps > 0 ? parseFloat((100 * (1 - gatewayErrors / totalOps)).toFixed(2)) : 100.0;
}

export function arbitrateSystemStatus(inputs: ArbitrationInputs): ArbitrationResult {
  const { nowUtc, providerReports, maintenanceResult, retentionDays, firstSeenDate, statusUrl } = inputs;
  const nowIso = nowUtc.toISOString();
  const today = nowIso.slice(0, 10);

  const book = new IncidentBook(inputs.existingIncidents ?? [], { nowUtc, retentionDays, purgeCutoffSec: inputs.purgeCutoffSec });
  const silencedUpstreamIds = book.silencedUpstreamIds();

  const statuses = deriveStatuses({
    windowMetrics: inputs.windowMetrics,
    providerReports,
    maintenanceResult,
    statusDistributionOk: inputs.statusDistributionProbe.success || Boolean(inputs.statusDistributionColdStart),
    silencedUpstreamIds,
  });

  const { components, dailySnapshots } = buildComponents({
    componentStatusMap: statuses.componentStatusMap,
    historyMap: inputs.historyMap,
    nowUtc,
    firstSeenDate,
    retentionDays,
  });

  book.seed(maintenanceResult?.incidents ?? [], inputs.purgeCutoffSec);
  reconcileIncidents({ book, nowIso, providerReports, statuses, maintenanceResult, silencedUpstreamIds });

  const snapshot = reconcileSnapshotHistory(
    {
      meta: {
        generatedAt: nowIso,
        apiVersion: "v1",
        version: STATUS_PAGE_VERSION,
        environment: "production",
        retentionDays,
        badgeUrl: `${statusUrl.replace(/\/+$/, "")}/badge.svg`,
      },
      summary: {
        overallStatus: statuses.overallStatus,
        rolling90dRatio: computeOverall90dRatio(components),
        rollingDays: computeTrackedDays(nowUtc, firstSeenDate, retentionDays),
        activeIncidentsCount: 0,
        past24hAvailability: computePast24hAvailability(inputs.dayWindowMetrics),
      },
      components,
      incidents: book.incidents,
      externalReferences: buildExternalReferences(providerReports),
    },
    { nowMs: nowUtc.getTime(), refreshStatuses: false },
  );

  const dailySnapshotsToPersist = dailySnapshots.filter((record) => {
    const todayCell = snapshot.components.find((c) => c.id === record.componentId)?.history90d.find((h) => h.date === today);
    return todayCell && todayCell.status !== "operational";
  });

  return { snapshot, dailySnapshotsToPersist };
}
