import { ComponentStatus, OverallStatus, WindowMetrics } from "../types";
import { MaintenanceEvaluationResult } from "../incidents/maintenance";
import { ProviderReport } from "../providers/index";
import { countErrors, countServedRequests } from "../signals/errorCodes";
import { assessFailureRate } from "../signals/failureRate";
import { ReachabilitySignal } from "../signals/reachability";

export interface DerivedStatuses {
  componentStatusMap: Record<string, ComponentStatus>;
  coreInfraStatus: ComponentStatus;
  backendCoreStatus: ComponentStatus;
  serviceAvailability: ComponentStatus;
  crashedSuppliersCount: number;
  overallStatus: OverallStatus;
}

export interface StatusDerivationInputs {
  windowMetrics: WindowMetrics;
  providerReports: ProviderReport[];
  maintenanceResult?: MaintenanceEvaluationResult;
  statusDistributionOk: boolean;
  silencedUpstreamIds: Set<string>;
  reachabilitySignals: ReachabilitySignal[];
}

export const upstreamIdsOf = (report: ProviderReport): string[] =>
  (report.activeIncidents ?? []).map((inc) => inc.id).filter((id): id is string => !!id);

function deriveProviderStatuses(
  reports: ProviderReport[],
  silencedUpstreamIds: Set<string>,
): Record<string, ComponentStatus> {
  const statuses: Record<string, ComponentStatus> = {};
  for (const report of reports) {
    const ids = upstreamIdsOf(report);
    const isSilenced = ids.length > 0 && ids.every((id) => silencedUpstreamIds.has(id));
    statuses[report.id] = isSilenced ? "operational" : report.status;
  }
  return statuses;
}

const worstOf = (statuses: ComponentStatus[]): ComponentStatus => {
  if (statuses.includes("major_outage")) return "major_outage";
  return statuses.includes("degraded_performance") ? "degraded_performance" : "operational";
};

const reachabilityStatusesFor = (signals: ReachabilitySignal[], target: ReachabilitySignal["target"]): ComponentStatus[] =>
  signals.filter((signal) => signal.target === target).map((signal) => signal.status);

function deriveBackendCoreStatus(reports: ProviderReport[], metrics: WindowMetrics): ComponentStatus {
  return worstOf([
    assessFailureRate(countErrors(metrics, "gateway"), countServedRequests(metrics)),
    ...reports.filter((report) => report.coreImpact?.affected).map((report) => report.coreImpact!.status),
  ]);
}

function deriveServiceAvailability(
  backendCoreStatus: ComponentStatus,
  translationStatuses: ComponentStatus[],
  directImpacts: ComponentStatus[],
): { status: ComponentStatus; crashedSuppliersCount: number } {
  const crashedSuppliersCount = translationStatuses.filter((s) => s === "major_outage").length;
  const isAnyDegraded = translationStatuses.some((s) => s === "degraded_performance" || s === "partial_outage");

  if (backendCoreStatus === "major_outage" || directImpacts.includes("major_outage") || crashedSuppliersCount >= 2) {
    return { status: "major_outage", crashedSuppliersCount };
  }
  if (
    backendCoreStatus === "degraded_performance" ||
    directImpacts.includes("degraded_performance") ||
    crashedSuppliersCount >= 1 ||
    isAnyDegraded
  ) {
    return { status: "degraded_performance", crashedSuppliersCount };
  }
  return { status: "operational", crashedSuppliersCount };
}

function applyMaintenanceOverrides(
  statuses: Record<string, ComponentStatus>,
  overrides?: Map<string, ComponentStatus>,
): void {
  for (const [componentId, overriddenStatus] of overrides?.entries() ?? []) {
    if (statuses[componentId] === "operational") statuses[componentId] = overriddenStatus;
  }
}

function deriveOverallStatus(
  serviceAvailability: ComponentStatus,
  maintenanceResult?: MaintenanceEvaluationResult,
): OverallStatus {
  if (maintenanceResult?.isCoreMaintenanceActive) return "maintenance";
  if (serviceAvailability === "major_outage") return "major_outage";
  return serviceAvailability === "degraded_performance" ? "degraded" : "operational";
}

export function deriveStatuses(inputs: StatusDerivationInputs): DerivedStatuses {
  const { windowMetrics, providerReports, maintenanceResult, statusDistributionOk, silencedUpstreamIds, reachabilitySignals } = inputs;
  const componentStatusMap = deriveProviderStatuses(providerReports, silencedUpstreamIds);

  const backendCoreStatus = deriveBackendCoreStatus(providerReports, windowMetrics);
  const coreInfraStatus = worstOf([backendCoreStatus, ...reachabilityStatusesFor(reachabilitySignals, "core_infrastructure")]);
  componentStatusMap["core_infrastructure"] = coreInfraStatus;

  const cloudflarePagesStatus = providerReports.find((p) => p.id === "upstream_cloudflare")?.raw?.pagesStatus;
  componentStatusMap["status_system"] =
    statusDistributionOk && cloudflarePagesStatus !== "major_outage" ? "operational" : "degraded_performance";

  const translationStatuses = providerReports
    .filter((p) => p.group === "translation_engines")
    .map((p) => componentStatusMap[p.id]);
  const { status: serviceAvailability, crashedSuppliersCount } = deriveServiceAvailability(
    backendCoreStatus,
    translationStatuses,
    reachabilityStatusesFor(reachabilitySignals, "service_availability"),
  );
  componentStatusMap["service_availability"] = serviceAvailability;

  applyMaintenanceOverrides(componentStatusMap, maintenanceResult?.activeOverrides);

  return {
    componentStatusMap,
    coreInfraStatus,
    backendCoreStatus,
    serviceAvailability,
    crashedSuppliersCount,
    overallStatus: deriveOverallStatus(serviceAvailability, maintenanceResult),
  };
}
