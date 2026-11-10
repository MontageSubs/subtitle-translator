import { ComponentStatus, IncidentStatus } from "../types";
import { incidentTitleOf } from "../incidents/templates";
import { ReachabilitySignal } from "../signals/reachability";
import { MaintenanceEvaluationResult } from "../incidents/maintenance";
import { componentIdsOf, isOpen } from "../incidents/utils";
import { ALL_STATUS_PROVIDERS, ProviderReport } from "../providers/index";
import { IncidentBook, progressStage } from "./incidentBook";
import { EcosystemGroup, listEcosystemGroups } from "./ecosystem";
import { DerivedStatuses, upstreamIdsOf } from "./statuses";

export interface IncidentFlowContext {
  book: IncidentBook;
  nowIso: string;
  providerReports: ProviderReport[];
  statuses: DerivedStatuses;
  maintenanceResult?: MaintenanceEvaluationResult;
  silencedUpstreamIds: Set<string>;
  reachabilitySignals: ReachabilitySignal[];
}

interface ProviderDependency {
  id: string;
  name: string;
  status: ComponentStatus;
  upstreamIds: string[];
}

const INFRA_COMPONENT_IDS = ["core_infrastructure", "service_availability"];
const INFRA_COMPONENT_NAME = "Core Infrastructure & Edge Delivery";
const STATIC_TRACKING_IDS = new Set(["upstream_google", "upstream_azure", "upstream_github", "upstream_storage"]);

const isImpacting = (signal: ReachabilitySignal): boolean => signal.status !== "operational";

const hasCoreReachabilityImpact = (ctx: IncidentFlowContext): boolean =>
  ctx.reachabilitySignals.some((signal) => signal.target === "core_infrastructure" && isImpacting(signal));

function reconcileInfrastructureIncident(ctx: IncidentFlowContext): void {
  const { book, nowIso, statuses } = ctx;
  const { coreInfraStatus, serviceAvailability } = statuses;

  if (coreInfraStatus === "operational") {
    const existing = book.locateByTitle(incidentTitleOf("infrastructure", INFRA_COMPONENT_NAME));
    if (isOpen(existing)) book.resolve(existing, "infrastructure", nowIso);
    return;
  }
  if (hasCoreReachabilityImpact(ctx)) return;

  const componentIds = serviceAvailability !== "operational" ? INFRA_COMPONENT_IDS : ["core_infrastructure"];
  const existing = book.locateByTitle(incidentTitleOf("infrastructure", INFRA_COMPONENT_NAME));
  const prior = isOpen(existing) ? existing : undefined;
  const isMajor = coreInfraStatus === "major_outage";
  const impactingProvider = ctx.providerReports.find((r) => r.coreImpact?.affected);
  book.emit({
    incidentId: existing?.id,
    componentId: componentIds,
    componentName: INFRA_COMPONENT_NAME,
    category: "infrastructure",
    severity: isMajor ? "major" : "minor",
    currentStatus: isMajor ? progressStage(prior?.status) : (prior?.status ?? "investigating"),
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    customDetail: impactingProvider?.coreImpact?.reason,
    existingUpdates: existing?.updates,
  });
}

function listActiveDependencies(
  group: EcosystemGroup,
  dependencies: ProviderDependency[],
  ctx: IncidentFlowContext,
): ProviderDependency[] {
  return group.memberIds
    .map((id) => dependencies.find((d) => d.id === id))
    .filter((d): d is ProviderDependency => Boolean(d))
    .filter(
      (dep) =>
        dep.status !== "operational" &&
        !ctx.maintenanceResult?.activeOverrides.has(dep.id) &&
        !ctx.book.isTrackedOpen(dep.id),
    );
}

function resolveAffectedComponentIds(activeDeps: ProviderDependency[], ctx: IncidentFlowContext): string[] {
  const { crashedSuppliersCount } = ctx.statuses;
  const componentIds = activeDeps.map((d) => d.id);

  const hasCrashedTranslation = activeDeps.some(
    (d) => ALL_STATUS_PROVIDERS.find((p) => p.id === d.id)?.group === "translation_engines" && d.status === "major_outage",
  );
  if (hasCrashedTranslation && crashedSuppliersCount >= 2) componentIds.push("service_availability");
  return componentIds;
}

function resolveGroupIncidentStatus(activeDeps: ProviderDependency[], prior?: { status: IncidentStatus }): IncidentStatus {
  const isStaticTracking = activeDeps.every((d) => STATIC_TRACKING_IDS.has(d.id) || d.status !== "major_outage");
  if (isStaticTracking) return prior?.status ?? "investigating";
  return !prior || prior.status === "investigating" ? "identified" : progressStage(prior.status);
}

function reconcileGroupIncident(
  group: EcosystemGroup,
  dependencies: ProviderDependency[],
  ctx: IncidentFlowContext,
): void {
  const { book, nowIso, silencedUpstreamIds } = ctx;
  const activeDeps = listActiveDependencies(group, dependencies, ctx);
  const upstreamIds = [
    ...new Set(activeDeps.flatMap((d) => d.upstreamIds).filter((id) => !silencedUpstreamIds.has(id))),
  ];
  const existing = book.locate(group.memberIds, upstreamIds);
  const prior = isOpen(existing) ? existing : undefined;

  if (activeDeps.length === 0) {
    if (prior) book.resolve(prior, "upstream_provider", nowIso);
    return;
  }

  const componentIds = [
    ...new Set([...componentIdsOf(existing), ...resolveAffectedComponentIds(activeDeps, ctx)]),
  ];
  const hasMajor = activeDeps.some((d) => d.status === "major_outage");

  book.emit({
    incidentId: existing?.id,
    componentId: componentIds,
    componentName: componentIds.length > 1 ? group.groupName : activeDeps[0].name,
    category: "upstream_provider",
    severity: hasMajor ? "major" : "minor",
    currentStatus: resolveGroupIncidentStatus(activeDeps, prior),
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    customDetail: upstreamIds[0],
    upstreamIds: [...new Set([...(existing?.upstreamIds ?? []), ...upstreamIds])],
    existingUpdates: existing?.updates,
  });
}

function reconcileReachabilityIncident(signal: ReachabilitySignal, ctx: IncidentFlowContext): void {
  const { book, nowIso, statuses } = ctx;
  const existing = book.locateByTitle(incidentTitleOf("domain_reachability", signal.subject));
  const prior = isOpen(existing) ? existing : undefined;

  if (!isImpacting(signal)) {
    if (prior) book.resolve(prior, "domain_reachability", nowIso);
    return;
  }

  const componentIds =
    signal.target === "core_infrastructure" && statuses.serviceAvailability !== "operational"
      ? INFRA_COMPONENT_IDS
      : [signal.target];
  const isMajor = signal.status === "major_outage";
  book.emit({
    incidentId: existing?.id,
    componentId: componentIds,
    componentName: signal.subject,
    category: "domain_reachability",
    severity: isMajor ? "major" : "minor",
    currentStatus: isMajor ? (!prior || prior.status === "investigating" ? "identified" : progressStage(prior.status)) : (prior?.status ?? "investigating"),
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    customDetail: signal.reason,
    existingUpdates: existing?.updates,
  });
}

function settleUnclaimedIncidents(ctx: IncidentFlowContext): void {
  const { book, nowIso, statuses } = ctx;
  for (const incident of book.unclaimed()) {
    const componentIds = componentIdsOf(incident);
    const isCovered = componentIds.every((id) => book.isTrackedOpen(id));
    const isRecovered = componentIds.every((id) => (statuses.componentStatusMap[id] || "operational") === "operational");

    if (!isOpen(incident) || incident.manual) book.keep(incident);
    else if (isCovered || isRecovered) book.resolve(incident, "upstream_provider", nowIso);
    else book.keep(incident);
  }
}

export function reconcileIncidents(ctx: IncidentFlowContext): void {
  const dependencies: ProviderDependency[] = ctx.providerReports.map((report) => ({
    id: report.id,
    name: report.name,
    status: ctx.statuses.componentStatusMap[report.id],
    upstreamIds: upstreamIdsOf(report),
  }));

  reconcileInfrastructureIncident(ctx);
  for (const signal of ctx.reachabilitySignals) {
    reconcileReachabilityIncident(signal, ctx);
  }
  for (const group of listEcosystemGroups()) {
    reconcileGroupIncident(group, dependencies, ctx);
  }
  settleUnclaimedIncidents(ctx);
}
