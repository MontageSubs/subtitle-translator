import { CellOverrides, Incident, ProbeResult, SystemStatusSnapshot, WindowMetrics } from "../types";
import { MaintenanceEvaluationResult } from "../incidents/maintenance";
import { ProviderReport } from "../providers/index";
import { reconcileSnapshotHistory } from "../snapshot/reconcile";
import { STATUS_PAGE_VERSION } from "./components";
import { MIN_CLIENT_VERSION } from "../compat";
import { buildExternalReferences } from "./ecosystem";
import { buildComponents, computeOverall90dRatio, computeTrackedDays } from "./history";
import { IncidentBook } from "./incidentBook";
import { reconcileIncidents } from "./incidentFlow";
import { deriveStatuses } from "./statuses";
import { computeServedAvailability } from "../signals/errorCodes";

export interface ArbitrationInputs {
  windowMetrics: WindowMetrics;
  dayWindowMetrics: WindowMetrics;
  historyOverrides: CellOverrides;
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

export function arbitrateSystemStatus(inputs: ArbitrationInputs): SystemStatusSnapshot {
  const { nowUtc, providerReports, maintenanceResult, retentionDays, firstSeenDate, statusUrl } = inputs;
  const nowIso = nowUtc.toISOString();

  const book = new IncidentBook(inputs.existingIncidents ?? [], { nowUtc, retentionDays, purgeCutoffSec: inputs.purgeCutoffSec });
  const silencedUpstreamIds = book.silencedUpstreamIds();

  const statuses = deriveStatuses({
    windowMetrics: inputs.windowMetrics,
    providerReports,
    maintenanceResult,
    statusDistributionOk: inputs.statusDistributionProbe.success || Boolean(inputs.statusDistributionColdStart),
    silencedUpstreamIds,
  });

  const components = buildComponents({
    componentStatusMap: statuses.componentStatusMap,
    nowUtc,
    firstSeenDate,
    retentionDays,
  });

  book.seed(maintenanceResult?.incidents ?? [], inputs.purgeCutoffSec);
  reconcileIncidents({ book, nowIso, providerReports, statuses, maintenanceResult, silencedUpstreamIds });

  return reconcileSnapshotHistory(
    {
      meta: {
        generatedAt: nowIso,
        apiVersion: "v1",
        version: STATUS_PAGE_VERSION,
        minClientVersion: MIN_CLIENT_VERSION,
        environment: "production",
        retentionDays,
        badgeUrl: `${statusUrl.replace(/\/+$/, "")}/badges/status/service.svg`,
      },
      summary: {
        overallStatus: statuses.overallStatus,
        rolling90dRatio: computeOverall90dRatio(components),
        rollingDays: computeTrackedDays(nowUtc, firstSeenDate, retentionDays),
        activeIncidentsCount: 0,
        past24hAvailability: computeServedAvailability(inputs.dayWindowMetrics),
      },
      components,
      incidents: book.incidents,
      externalReferences: buildExternalReferences(providerReports),
    },
    { overrides: inputs.historyOverrides, nowMs: nowUtc.getTime(), refreshStatuses: false },
  );
}
