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
  dayWindowMetrics: WindowMetrics;
  historyMap: Map<string, ComponentHistoryEntry[]>;
  frontendProbe: ProbeResult;
  statusDistributionProbe: ProbeResult;
  tursoPlatformStatus?: ComponentStatus;
  providerChecks: Array<{ plugin: ProviderPlugin; result: any }>;
  sharedState: Map<string, any>;
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

function simplifyBrandStatusName(rawName: string): string {
  const name = String(rawName || "").replace(/ \(.*\)/, "").trim();
  if (/google\s*cloud/i.test(name)) return "Google Cloud Status";
  if (/azure|microsoft\s*azure/i.test(name)) return "Microsoft Azure Status";
  if (/cloudflare/i.test(name)) return "Cloudflare Status";
  if (/github/i.test(name)) return "GitHub Status";
  if (/deepl/i.test(name)) return "DeepL Status";
  if (/turso/i.test(name)) return "Turso Status";
  
  const cleaned = name
    .replace(/\s*(?:Global|Platform|Edge)?\s*Infrastructure.*/i, "")
    .replace(/\s*(?:API|Engine).*/i, "")
    .trim();
  return cleaned.toLowerCase().endsWith("status") ? cleaned : `${cleaned} Status`;
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
    firstSeenDate,
    retentionDays,
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
  
  let isGlobalGithubOutage = false;
  let isOurConfigError = false;

  if (!frontendProbe.success || githubStatusValue === "major_outage") {
    coreInfraStatus = "major_outage";
    if (githubStatusValue === "major_outage") {
       isGlobalGithubOutage = true;
    } else {
       isOurConfigError = true;
    }
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

  if (blockingStorageErrors > 0) {
    coreInfraStatus = "major_outage";
    isOurConfigError = true;
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

  let isTursoError = false;
  let storageStatus: ComponentStatus = "operational";

  if (
    nonBlockingStorageErrors > 0 ||
    inputs.tursoPlatformStatus === "degraded_performance" ||
    inputs.tursoPlatformStatus === "partial_outage" ||
    inputs.tursoPlatformStatus === "major_outage"
  ) {
    isTursoError = true;
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
    engineDegradedCount >= 1
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

    const requiredDates = Array.from({ length: retentionDays }, (_, i) => {
      const d = new Date(nowUtc);
      d.setUTCDate(d.getUTCDate() - (retentionDays - 1 - i));
      return d.toISOString().slice(0, 10);
    });

    const dateMap = new Map(existingHistory.map((h) => [h.date, h]));

    const history90d: ComponentHistoryEntry[] = requiredDates.map((date) => {
      if (date === todayDateStr) {
        return { date: todayDateStr, status: todayCellStatus, uptime: todayUptime };
      }
      const existing = dateMap.get(date);
      if (existing) {
        return { date, status: existing.status, uptime: existing.uptime };
      }
      return date >= firstSeenDate
        ? { date, status: "operational", uptime: 100 }
        : { date, status: "nodata", uptime: null };
    });

    let activeDays = 0;
    let sumUptime = 0;
    for (const h of history90d) {
      if (h.status !== "nodata" && typeof h.uptime === "number") {
        activeDays++;
        sumUptime += h.uptime;
      }
    }
    const ratio90d =
      activeDays > 0 ? parseFloat((sumUptime / activeDays).toFixed(2)) : 100.0;

    if (todayFailures > 0) {
      dailySnapshotsToPersist.push({
        componentId: def.id,
        status: todayCellStatus,
        uptimeRatio: todayUptime,
        totalEvents: todayTotal,
        failureEvents: todayFailures,
      });
    }

    return {
      id: def.id,
      name: def.name,
      group: def.group,
      status: curStatus,
      uptime90d: ratio90d,
      history90d,
    };
  });

  const coreServiceIds = COMPONENT_DEFINITIONS.filter((d) => d.group === "core_services").map((d) => d.id);
  const coreServiceComponents = components.filter((c) => coreServiceIds.includes(c.id));
  const overall90dRatio = parseFloat(
    (
      coreServiceComponents.reduce((sum, c) => sum + c.uptime90d, 0) /
      Math.max(coreServiceComponents.length, 1)
    ).toFixed(2),
  );

  const trackedDays = Math.max(
    1,
    Math.min(
      retentionDays,
      Math.floor((nowUtc.getTime() - new Date(`${firstSeenDate}T00:00:00Z`).getTime()) / 86_400_000) + 1,
    ),
  );

  let dayGatewayErrors = 0;
  let dayBlockingErrors = 0;
  for (const [code, count] of inputs.dayWindowMetrics.errorsByCode.entries()) {
    if (code >= 1000 && code < 2000) dayGatewayErrors += count;
    if (code === 2001 || code === 2002) dayBlockingErrors += count;
  }
  const dayTotalOps = inputs.dayWindowMetrics.totalJobs + dayGatewayErrors + dayBlockingErrors;
  const past24hAvail =
    dayTotalOps > 0
      ? parseFloat((100 * (1 - (dayGatewayErrors + dayBlockingErrors) / dayTotalOps)).toFixed(2))
      : 100.0;

  const incidents: Incident[] = [];
  const purgeLimitMs = inputs.purgeCutoffSec ? inputs.purgeCutoffSec * 1000 : 0;
  if (maintenanceResult?.incidents) {
    for (const m of maintenanceResult.incidents) {
      if (purgeLimitMs > 0) {
        const mTime = new Date(m.resolvedAt || m.updatedAt || m.createdAt).getTime();
        if (mTime >= purgeLimitMs) {
          continue;
        }
      }
      incidents.push(m);
    }
  }

  const resolvedIncidentsMap = new Map<string, Incident>();
  const activeExistingIncidents = new Map<string, Incident>();
  
  if (inputs.existingIncidents) {
    const retentionAgo = nowUtc.getTime() - retentionDays * 24 * 60 * 60 * 1000;
    for (const inc of inputs.existingIncidents) {
      const incTime = new Date(inc.resolvedAt || inc.updatedAt || inc.createdAt).getTime();
      if (purgeLimitMs > 0 && incTime >= purgeLimitMs) {
        continue;
      }
      if (inc.id.startsWith("inc_m_") || inc.id.startsWith("inc_maint-") || inc.title.includes("Scheduled Maintenance") || inc.title.includes("Upcoming Maintenance") || inc.title.includes("Completed Maintenance")) {
        continue;
      }
      if (inc.status === "resolved") {
        if (new Date(inc.resolvedAt || inc.updatedAt).getTime() >= retentionAgo) {
          resolvedIncidentsMap.set(inc.id, inc);
        }
      } else {
        activeExistingIncidents.set(inc.id, inc);
      }
    }
  }

  function findExistingCombinedIncident(compIds: string[]): Incident | undefined {
    for (const inc of activeExistingIncidents.values()) {
       if (Array.isArray(inc.componentId)) {
          if (compIds.some(id => inc.componentId.includes(id))) return inc;
       } else {
          if (compIds.includes(inc.componentId)) return inc;
       }
    }
    return undefined;
  }

  if (isGlobalGithubOutage) {
    const compIds = ["upstream_github", "core_infrastructure", "service_availability"];
    const existing = findExistingCombinedIncident(compIds);
    const nextStatus = progressStage(existing?.status);
    incidents.push(
      buildIncidentFromTemplate({
        incidentId: existing?.id || `inc_${String(todayDateStr).replace(/-/g, "")}_global`,
        componentId: compIds,
        componentName: "GitHub Platform Infrastructure",
        category: "infrastructure",
        severity: "critical",
        currentStatus: nextStatus,
        createdAt: existing?.createdAt || isoTimestamp,
        updatedAt: isoTimestamp,
        existingUpdates: existing?.updates,
      })
    );
  } else {
    const existing = findExistingCombinedIncident(["upstream_github", "core_infrastructure", "service_availability"]);
    if (existing && existing.title.includes("GitHub Platform Infrastructure")) {
      incidents.push(
        buildIncidentFromTemplate({
          ...existing,
          currentStatus: "resolved",
          updatedAt: isoTimestamp,
          existingUpdates: existing.updates
        } as any)
      );
    }
  }

  if (isOurConfigError && !isGlobalGithubOutage) {
    const compIds = ["core_infrastructure", "service_availability"];
    const existing = findExistingCombinedIncident(compIds);
    const nextStatus = progressStage(existing?.status);
    incidents.push(
      buildIncidentFromTemplate({
        incidentId: existing?.id || `inc_${String(todayDateStr).replace(/-/g, "")}_core`,
        componentId: compIds,
        componentName: "Core Infrastructure & Edge Delivery",
        category: "infrastructure",
        severity: "major",
        currentStatus: nextStatus,
        createdAt: existing?.createdAt || isoTimestamp,
        updatedAt: isoTimestamp,
        existingUpdates: existing?.updates,
      })
    );
  } else {
    const existing = findExistingCombinedIncident(["core_infrastructure", "service_availability"]);
    if (existing && existing.title.includes("Core Infrastructure & Edge Delivery")) {
      incidents.push(
        buildIncidentFromTemplate({
          ...existing,
          currentStatus: "resolved",
          updatedAt: isoTimestamp,
          existingUpdates: existing.updates
        } as any)
      );
    }
  }

  if (isTursoError) {
    const compIds = ["upstream_storage"];
    const existing = findExistingCombinedIncident(compIds);
    const nextStatus = progressStage(existing?.status);
    incidents.push(
      buildIncidentFromTemplate({
        incidentId: existing?.id || `inc_${String(todayDateStr).replace(/-/g, "")}_storage`,
        componentId: compIds,
        componentName: "Database & Storage Infrastructure",
        category: "storage",
        severity: "minor",
        currentStatus: nextStatus,
        createdAt: existing?.createdAt || isoTimestamp,
        updatedAt: isoTimestamp,
        existingUpdates: existing?.updates,
      })
    );
  } else {
    const existing = findExistingCombinedIncident(["upstream_storage"]);
    if (existing && existing.title.includes("Database & Storage Infrastructure")) {
      incidents.push(
        buildIncidentFromTemplate({
          ...existing,
          currentStatus: "resolved",
          updatedAt: isoTimestamp,
          existingUpdates: existing.updates
        } as any)
      );
    }
  }

  const depDefs = PROVIDER_PLUGINS.map((p) => ({
    id: p.id,
    name: p.name,
    status: componentStatusMap[p.id],
  }));

  for (const dep of depDefs) {
    const isOverride = maintenanceResult?.activeOverrides.has(dep.id);
    const depActive = dep.status !== "operational" && !isOverride;
    
    if (dep.id === "upstream_github") continue;

    const existingDepInc = findExistingCombinedIncident([dep.id]);
    
    const causesServiceDegradation = (engineOutageCount >= 2 && dep.status === "major_outage") || (serviceAvailability !== "operational" && dep.status !== "operational");
    
    let compIds: string | string[] = causesServiceDegradation && !isGlobalGithubOutage && !isOurConfigError 
       ? [dep.id, "service_availability"] 
       : [dep.id];

    if (depActive) {
      const nextStatus: IncidentStatus =
        dep.status === "major_outage"
          ? existingDepInc?.status === "investigating" || !existingDepInc
            ? "identified"
            : progressStage(existingDepInc.status)
          : progressStage(existingDepInc?.status);
      incidents.push(
        buildIncidentFromTemplate({
          incidentId: existingDepInc?.id || `inc_${String(todayDateStr).replace(/-/g, "")}_${dep.id}`,
          componentId: compIds,
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
      incidents.push(
        buildIncidentFromTemplate({
          ...existingDepInc,
          componentId: existingDepInc.componentId,
          componentName: dep.name,
          category: "upstream_provider",
          currentStatus: "resolved",
          updatedAt: isoTimestamp,
          existingUpdates: existingDepInc.updates
        } as any)
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
          name: simplifyBrandStatusName(p.name),
          url: p.referenceUrl!,
        })),
        {
          name: "Turso Status",
          url: "https://status.turso.tech",
        },
      ].map((ref) => [ref.url, ref]),
    ).values(),
  );

  const badgeBase = String(statusUrl).replace(/\/+$/, "");
  const badgeUrl = `${badgeBase}/badge.svg`;

  const snapshot: SystemStatusSnapshot = {
    meta: {
      generatedAt: isoTimestamp,
      apiVersion: "v1",
      version: STATUS_PAGE_VERSION,
      environment: "production",
      retentionDays,
      badgeUrl,
    },
    summary: {
      overallStatus,
      rolling90dRatio: overall90dRatio,
      rollingDays: trackedDays,
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
