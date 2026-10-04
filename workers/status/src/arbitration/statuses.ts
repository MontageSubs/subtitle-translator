import { ComponentStatus, OverallStatus, WindowMetrics } from "../types";
import { MaintenanceEvaluationResult } from "../incidents/maintenance";
import { ProviderReport } from "../providers/index";

export interface DerivedStatuses {
  componentStatusMap: Record<string, ComponentStatus>;
  coreInfraStatus: ComponentStatus;
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
}

const GATEWAY_ERROR_RANGE = { min: 1000, max: 2000 };
const GATEWAY_ERROR_MAJOR_RATE = 0.05;

export const upstreamIdsOf = (report: ProviderReport): string[] =>
  (report.activeIncidents ?? []).map((inc) => inc.id).filter((id): id is string => !!id);

export function sumGatewayErrors(metrics: WindowMetrics): number {
  let total = 0;
  for (const [code, count] of metrics.errorsByCode.entries()) {
    if (code >= GATEWAY_ERROR_RANGE.min && code < GATEWAY_ERROR_RANGE.max) total += count;
  }
  return total;
}

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

function deriveCoreInfraStatus(reports: ProviderReport[], metrics: WindowMetrics): ComponentStatus {
  let status: ComponentStatus = "operational";
  for (const report of reports) {
    if (!report.coreImpact?.affected) continue;
    if (report.coreImpact.status === "major_outage") {
      status = "major_outage";
      break;
    }
    if (report.coreImpact.status === "degraded_performance") status = "degraded_performance";
  }

  const gatewayErrors = sumGatewayErrors(metrics);
  const totalOps = metrics.totalJobs + gatewayErrors;
  if (totalOps > 0 && gatewayErrors > 0) {
    if (gatewayErrors / totalOps >= GATEWAY_ERROR_MAJOR_RATE) status = "major_outage";
    else if (status !== "major_outage") status = "degraded_performance";
  }
  return status;
}

function deriveServiceAvailability(
  coreInfraStatus: ComponentStatus,
  translationStatuses: ComponentStatus[],
): { status: ComponentStatus; crashedSuppliersCount: number } {
  const crashedSuppliersCount = translationStatuses.filter((s) => s === "major_outage").length;
  const isAnyDegraded = translationStatuses.some((s) => s === "degraded_performance" || s === "partial_outage");

  if (coreInfraStatus === "major_outage" || crashedSuppliersCount >= 2) {
    return { status: "major_outage", crashedSuppliersCount };
  }
  if (coreInfraStatus === "degraded_performance" || crashedSuppliersCount >= 1 || isAnyDegraded) {
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
  const { windowMetrics, providerReports, maintenanceResult, statusDistributionOk, silencedUpstreamIds } = inputs;
  const componentStatusMap = deriveProviderStatuses(providerReports, silencedUpstreamIds);

  const coreInfraStatus = deriveCoreInfraStatus(providerReports, windowMetrics);
  componentStatusMap["core_infrastructure"] = coreInfraStatus;

  const cloudflarePagesStatus = providerReports.find((p) => p.id === "upstream_cloudflare")?.raw?.pagesStatus;
  componentStatusMap["status_system"] =
    statusDistributionOk && cloudflarePagesStatus !== "major_outage" ? "operational" : "degraded_performance";

  const translationStatuses = providerReports
    .filter((p) => p.group === "translation_engines")
    .map((p) => componentStatusMap[p.id]);
  const { status: serviceAvailability, crashedSuppliersCount } = deriveServiceAvailability(
    coreInfraStatus,
    translationStatuses,
  );
  componentStatusMap["service_availability"] = serviceAvailability;

  applyMaintenanceOverrides(componentStatusMap, maintenanceResult?.activeOverrides);

  return {
    componentStatusMap,
    coreInfraStatus,
    serviceAvailability,
    crashedSuppliersCount,
    overallStatus: deriveOverallStatus(serviceAvailability, maintenanceResult),
  };
}
