import {
  ComponentStatus,
  OverallStatus,
  StatusComponent,
  Incident,
  IncidentStatus,
  WindowMetrics,
  ProbeResult,
  ComponentHistoryEntry,
  SystemStatusSnapshot,
  classifyDailyUptime,
} from "./types";
import { MaintenanceEvaluationResult } from "./maintenance";
import { buildIncidentFromTemplate } from "./templates";
import { ProviderPlugin, PROVIDER_PLUGINS } from "./providers/index";

export const STATUS_PAGE_VERSION = "1.0.0";

export interface ArbitrationInputs {
  windowMetrics: WindowMetrics;
  historyMap: Map<string, ComponentHistoryEntry[]>;
  frontendProbe: ProbeResult;
  statusDistributionProbe: ProbeResult;
  storageProbe?: ProbeResult;
  tursoPlatformStatus?: ComponentStatus;
  providerChecks: Array<{ plugin: ProviderPlugin; result: any }>;
  sharedState: Map<string, any>;
  maintenanceResult?: MaintenanceEvaluationResult;
  existingIncidents?: Incident[];
  statusDistributionColdStart?: boolean;
  nowUtc: Date;
  statusUrl: string;
}

export interface ArbitrationResult {
  snapshot: SystemStatusSnapshot;
  dailySnapshotsToPersist: Array<{
    componentId: string;
    status: string;
    uptimeRatio: number;
    totalEvents: number;
    failureEvents: number;
  }>;
}

function progressStage(prior?: IncidentStatus): IncidentStatus {
  if (prior === "investigating") return "identified";
  if (prior === "identified" || prior === "monitoring") return "monitoring";
  return "investigating";
}

export function arbitrateSystemStatus(
  inputs: ArbitrationInputs,
): ArbitrationResult {
  const {
    windowMetrics,
    historyMap,
    frontendProbe,
    statusDistributionProbe,
    providerChecks,
    sharedState,
    maintenanceResult,
    nowUtc,
    statusUrl,
  } = inputs;

  const isoTimestamp = nowUtc.toISOString();
  const todayDateStr = isoTimestamp.slice(0, 10);

  const componentStatusMap: Record<string, ComponentStatus> = {};
  const providerContext = { windowMetrics, sharedState };

  for (const { plugin, result } of providerChecks) {
    componentStatusMap[plugin.id] = plugin.evaluate(result, providerContext);
  }

  const githubStatusValue =
    componentStatusMap["upstream_github"] || "operational";

  let coreInfraStatus: ComponentStatus = "operational";
  if (!frontendProbe.success || githubStatusValue === "major_outage") {
    coreInfraStatus = "major_outage";
  } else if (
    githubStatusValue === "degraded_performance" ||
    githubStatusValue === "partial_outage"
  ) {
    coreInfraStatus = "degraded_performance";
  }

  let gatewayErrors = 0;
  let blockingStorageErrors = 0;
  let nonBlockingStorageErrors = 0;

  for (const [code, count] of windowMetrics.errorsByCode.entries()) {
    if (code >= 1000 && code < 2000) gatewayErrors += count;
    if (code === 2001 || code === 2002) blockingStorageErrors += count;
    if (code === 2003 || code === 2004) nonBlockingStorageErrors += count;
  }

  const totalOps =
    windowMetrics.totalJobs + gatewayErrors + blockingStorageErrors;
  if (totalOps > 0 && gatewayErrors + blockingStorageErrors > 0) {
    const errorRate = (gatewayErrors + blockingStorageErrors) / totalOps;
    if (errorRate >= 0.05) {
      coreInfraStatus = "major_outage";
    } else if (coreInfraStatus !== "major_outage") {
      coreInfraStatus = "degraded_performance";
    }
  }

  let storageStatus: ComponentStatus = "operational";
  if (inputs.storageProbe && !inputs.storageProbe.success) {
    storageStatus = "degraded_performance";
  } else if (
    (inputs.storageProbe && inputs.storageProbe.latencyMs > 2500) ||
    nonBlockingStorageErrors > 0 ||
    inputs.tursoPlatformStatus === "degraded_performance" ||
    inputs.tursoPlatformStatus === "partial_outage" ||
    inputs.tursoPlatformStatus === "major_outage"
  ) {
    storageStatus = "degraded_performance";
  }

  componentStatusMap["core_infrastructure"] = coreInfraStatus;
  componentStatusMap["upstream_storage"] = storageStatus;
  componentStatusMap["status_system"] =
    statusDistributionProbe.success || inputs.statusDistributionColdStart
      ? "operational"
      : "degraded_performance";

  const engineStatuses = PROVIDER_PLUGINS.filter(
    (p) => p.group === "translation_engines",
  ).map((p) => componentStatusMap[p.id] || "operational");
  const engineOutageCount = engineStatuses.filter(
    (s) => s === "major_outage",
  ).length;
  const engineDegradedCount = engineStatuses.filter(
    (s) => s === "degraded_performance" || s === "partial_outage",
  ).length;

  let serviceAvailability: ComponentStatus = "operational";
  if (
    coreInfraStatus === "major_outage" ||
    engineOutageCount >= 2
  ) {
    serviceAvailability = "major_outage";
  } else if (
    coreInfraStatus === "degraded_performance" ||
    engineOutageCount === 1 ||
    engineDegradedCount >= 1 ||
    storageStatus === "degraded_performance"
  ) {
    serviceAvailability = "degraded_performance";
  }

  componentStatusMap["service_availability"] = serviceAvailability;

  if (maintenanceResult?.activeOverrides) {
    for (const [
      compId,
      overriddenStatus,
    ] of maintenanceResult.activeOverrides.entries()) {
      if (componentStatusMap[compId] === "operational") {
        componentStatusMap[compId] = overriddenStatus;
      }
    }
  }

  let overallStatus: OverallStatus = "operational";
  if (maintenanceResult?.isCoreMaintenanceActive) {
    overallStatus = "maintenance";
  } else if (serviceAvailability === "major_outage") {
    overallStatus = "major_outage";
  } else if (serviceAvailability === "degraded_performance") {
    overallStatus = "degraded";
  }

  const dailySnapshotsToPersist: Array<{
    componentId: string;
    status: string;
    uptimeRatio: number;
    totalEvents: number;
    failureEvents: number;
  }> = [];

  const COMPONENT_DEFINITIONS = [
    {
      id: "service_availability",
      name: "Subtitle Translation Service",
      group: "core_services" as const,
    },
    {
      id: "core_infrastructure",
      name: "Core Infrastructure & Edge Delivery",
      group: "core_services" as const,
    },
    {
      id: "status_system",
      name: "Status & Health Monitoring",
      group: "core_services" as const,
    },
    ...PROVIDER_PLUGINS.map((p) => ({
      id: p.id,
      name: p.name,
      group: p.group,
    })),
    {
      id: "upstream_storage",
      name: "Database & Storage Infrastructure",
      group: "infrastructure_dependencies" as const,
    },
  ];

  const components: StatusComponent[] = COMPONENT_DEFINITIONS.map((def) => {
    const curStatus = componentStatusMap[def.id] || "operational";
    const existingHistory = historyMap.get(def.id) || [];
    let history90d = existingHistory.map((h) => ({ ...h }));

    const priorToday = existingHistory.find((h) => h.date === todayDateStr);
    const priorTotal = priorToday?.totalEvents ?? 0;
    const priorFailure = priorToday?.failureEvents ?? 0;
    const failureWeight =
      curStatus === "major_outage" ? 1 : curStatus === "degraded_performance" || curStatus === "partial_outage" ? 0.5 : 0;

    const todayTotal = priorTotal + 1;
    const todayFailures = priorFailure + failureWeight;
    const todayUptime = parseFloat(
      (100 * ((todayTotal - todayFailures) / todayTotal)).toFixed(2),
    );
    const todayCellStatus = classifyDailyUptime(todayUptime);

    const requiredDates = Array.from({ length: 90 }, (_, i) => {
      const d = new Date(nowUtc);
      d.setUTCDate(d.getUTCDate() - (89 - i));
      return d.toISOString().slice(0, 10);
    });

    const dateMap = new Map(history90d.map((h) => [h.date, h]));

    history90d = requiredDates.map((date) => {
      if (date === todayDateStr) {
        return {
          date: todayDateStr,
          status: todayCellStatus,
          uptime: todayUptime,
        };
      }
      const existing = dateMap.get(date);
      if (existing) {
        return existing;
      }
      return {
        date,
        status: "nodata",
        uptime: 100.0,
      };
    });

    let activeDays = 0;
    let sumUptime = 0;
    for (const h of history90d) {
      if (h.status !== "nodata") {
        activeDays++;
        sumUptime += h.uptime;
      }
    }
    const ratio90d =
      activeDays > 0 ? parseFloat((sumUptime / activeDays).toFixed(2)) : 100.0;

    dailySnapshotsToPersist.push({
      componentId: def.id,
      status: todayCellStatus,
      uptimeRatio: todayUptime,
      totalEvents: todayTotal,
      failureEvents: todayFailures,
    });

    return {
      id: def.id,
      name: def.name,
      group: def.group,
      status: curStatus,
      uptime90d: ratio90d,
      history90d,
    };
  });

  const overallUptimeSum = components.reduce(
    (acc, c) => acc + c.uptime90d,
    0,
  );
  const overall90dRatio = parseFloat(
    (overallUptimeSum / components.length).toFixed(2),
  );
  const past24hAvail =
    serviceAvailability === "operational"
      ? 100.0
      : serviceAvailability === "degraded_performance"
        ? 98.0
        : 0.0;

  const incidents: Incident[] = [];
  if (maintenanceResult?.incidents) {
    for (const m of maintenanceResult.incidents) {
      incidents.push(m);
    }
  }

  const resolvedIncidentsMap = new Map<string, Incident>();
  const activeExistingIncidents = new Map<string, Incident>();
  
  if (inputs.existingIncidents) {
    const ninetyDaysAgo = nowUtc.getTime() - 90 * 24 * 60 * 60 * 1000;
    for (const inc of inputs.existingIncidents) {
      if (inc.id.startsWith("inc_m_") || inc.title.includes("Scheduled Maintenance") || inc.title.includes("Upcoming Maintenance") || inc.title.includes("Completed Maintenance")) {
        continue;
      }
      if (inc.status === "resolved") {
        if (new Date(inc.resolvedAt || inc.updatedAt).getTime() >= ninetyDaysAgo) {
          resolvedIncidentsMap.set(inc.id, inc);
        }
      } else {
        activeExistingIncidents.set(inc.componentId, inc);
      }
    }
  }

  const gatewayActive = serviceAvailability !== "operational";
  const existingGatewayInc = activeExistingIncidents.get("service_availability");
  
  if (gatewayActive) {
    const nextStatus: IncidentStatus =
      serviceAvailability === "major_outage"
        ? existingGatewayInc?.status === "investigating" || !existingGatewayInc
          ? "identified"
          : progressStage(existingGatewayInc.status)
        : progressStage(existingGatewayInc?.status);
    incidents.push(
      buildIncidentFromTemplate({
        incidentId: existingGatewayInc?.id || `inc_${todayDateStr.replace(/-/g, "")}_gateway`,
        componentId: "service_availability",
        componentName: "Subtitle Translation Service",
        category: "core_service",
        severity: serviceAvailability === "major_outage" ? "critical" : "major",
        currentStatus: nextStatus,
        createdAt: existingGatewayInc?.createdAt || isoTimestamp,
        updatedAt: isoTimestamp,
        existingUpdates: existingGatewayInc?.updates,
      }),
    );
  } else if (existingGatewayInc) {
    const nextStatus: IncidentStatus =
      existingGatewayInc.status === "monitoring" ? "resolved" : "monitoring";
    incidents.push(
      buildIncidentFromTemplate({
        incidentId: existingGatewayInc.id,
        componentId: "service_availability",
        componentName: "Subtitle Translation Service",
        category: "core_service",
        severity: existingGatewayInc.severity,
        currentStatus: nextStatus,
        createdAt: existingGatewayInc.createdAt,
        updatedAt: isoTimestamp,
        existingUpdates: existingGatewayInc.updates,
      }),
    );
  }

  const storageActive = storageStatus !== "operational";
  const existingStorageInc = activeExistingIncidents.get("upstream_storage");
  if (storageActive) {
    const nextStatus: IncidentStatus = progressStage(existingStorageInc?.status);
    incidents.push(
      buildIncidentFromTemplate({
        incidentId:
          existingStorageInc?.id ||
          `inc_${todayDateStr.replace(/-/g, "")}_storage`,
        componentId: "upstream_storage",
        componentName: "Database & Storage Infrastructure",
        category: "storage",
        severity: "minor",
        currentStatus: nextStatus,
        createdAt: existingStorageInc?.createdAt || isoTimestamp,
        updatedAt: isoTimestamp,
        existingUpdates: existingStorageInc?.updates,
      }),
    );
  } else if (existingStorageInc) {
    const nextStatus: IncidentStatus =
      existingStorageInc.status === "monitoring" ? "resolved" : "monitoring";
    incidents.push(
      buildIncidentFromTemplate({
        incidentId: existingStorageInc.id,
        componentId: "upstream_storage",
        componentName: "Database & Storage Infrastructure",
        category: "storage",
        severity: existingStorageInc.severity,
        currentStatus: nextStatus,
        createdAt: existingStorageInc.createdAt,
        updatedAt: isoTimestamp,
        existingUpdates: existingStorageInc.updates,
      }),
    );
  }

  const depDefs = PROVIDER_PLUGINS.map((p) => ({
    id: p.id,
    name: p.name,
    status: componentStatusMap[p.id],
  }));

  for (const dep of depDefs) {
    const isOverride = maintenanceResult?.activeOverrides.has(dep.id);
    const depActive = dep.status !== "operational" && !isOverride;
    const existingDepInc = activeExistingIncidents.get(dep.id);

    if (depActive) {
      const nextStatus: IncidentStatus =
        dep.status === "major_outage"
          ? existingDepInc?.status === "investigating" || !existingDepInc
            ? "identified"
            : progressStage(existingDepInc.status)
          : progressStage(existingDepInc?.status);
      incidents.push(
        buildIncidentFromTemplate({
          incidentId: existingDepInc?.id || `inc_${todayDateStr.replace(/-/g, "")}_${dep.id}`,
          componentId: dep.id,
          componentName: dep.name,
          category: "upstream_provider",
          severity: dep.status === "major_outage" ? "major" : "minor",
          currentStatus: nextStatus,
          createdAt: existingDepInc?.createdAt || isoTimestamp,
          updatedAt: isoTimestamp,
          existingUpdates: existingDepInc?.updates,
        }),
      );
    } else if (existingDepInc) {
      const nextStatus: IncidentStatus =
        existingDepInc.status === "monitoring" ? "resolved" : "monitoring";
      incidents.push(
        buildIncidentFromTemplate({
          incidentId: existingDepInc.id,
          componentId: dep.id,
          componentName: dep.name,
          category: "upstream_provider",
          severity: existingDepInc.severity,
          currentStatus: nextStatus,
          createdAt: existingDepInc.createdAt,
          updatedAt: isoTimestamp,
          existingUpdates: existingDepInc.updates,
        }),
      );
    }
  }

  for (const [id, inc] of resolvedIncidentsMap.entries()) {
    if (!incidents.find((i) => i.id === id)) {
      incidents.push(inc);
    }
  }

  const activeIncidentsCount = incidents.filter(
    (inc) => inc.status !== "resolved",
  ).length;

  const externalReferences = Array.from(
    new Map(
      [
        ...PROVIDER_PLUGINS.filter((p) => p.referenceUrl).map((p) => ({
          name: `${p.name.replace(/ \(.*\)/, "")} Status`,
          url: p.referenceUrl!,
        })),
        {
          name: "Turso Status",
          url: "https://status.turso.tech",
        },
      ].map((ref) => [ref.url, ref]),
    ).values(),
  );

  const badgeBase = statusUrl.replace(/\/+$/, "");
  const badgeUrl = `${badgeBase}/badge.svg`;

  const snapshot: SystemStatusSnapshot = {
    meta: {
      generatedAt: isoTimestamp,
      apiVersion: "v1",
      version: STATUS_PAGE_VERSION,
      environment: "production",
      retentionDays: 90,
      badgeUrl,
    },
    summary: {
      overallStatus,
      rolling90dRatio: overall90dRatio,
      activeIncidentsCount,
      past24hAvailability: past24hAvail,
    },
    components,
    incidents,
    externalReferences,
  };

  return {
    snapshot,
    dailySnapshotsToPersist,
  };
}
