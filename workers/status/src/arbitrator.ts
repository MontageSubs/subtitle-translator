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
import {
  MaintenanceEvaluationResult,
  evaluateMaintenanceSchedule,
} from "./maintenance";
import { buildIncidentFromTemplate, generateUnifiedIncidentId } from "./templates";
import { ProviderPlugin, PROVIDER_PLUGINS } from "./providers/index";
import { reconcileSnapshotHistory } from "./manualOps";

export const COMPONENT_DEFINITIONS = [
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

  const paStatus = componentStatusMap["google_pa"] || "operational";
  const v2Status = componentStatusMap["google_v2"] || "operational";
  if (paStatus === "major_outage" || v2Status === "major_outage") {
    componentStatusMap["upstream_google"] = "major_outage";
  } else if (
    paStatus === "degraded_performance" ||
    paStatus === "partial_outage" ||
    v2Status === "degraded_performance" ||
    v2Status === "partial_outage"
  ) {
    if (componentStatusMap["upstream_google"] !== "major_outage") {
      componentStatusMap["upstream_google"] = "degraded_performance";
    }
  }

  const ghCheck = providerChecks.find((p) => p.plugin.id === "upstream_github");
  const ghPageStatus: ComponentStatus = ghCheck?.result?.pageStatus || "operational";

  let coreInfraStatus: ComponentStatus = "operational";

  if (!frontendProbe.success) {
    coreInfraStatus = "major_outage";
  } else if (
    ghPageStatus === "major_outage" ||
    ghPageStatus === "degraded_performance" ||
    ghPageStatus === "partial_outage"
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
  
  const cfCheck = providerChecks.find((p) => p.plugin.id === "upstream_cloudflare");
  const cfPagesStatus = cfCheck?.result?.pagesStatus || "operational";

  componentStatusMap["status_system"] =
    (statusDistributionProbe.success || inputs.statusDistributionColdStart) && cfPagesStatus !== "major_outage"
      ? "operational"
      : "degraded_performance";

  const isGooglePaCrashed =
    componentStatusMap["google_pa"] === "major_outage";
  const isGoogleV2Crashed =
    componentStatusMap["google_v2"] === "major_outage";
  const isMicrosoftCrashed =
    componentStatusMap["microsoft_translator"] === "major_outage" ||
    componentStatusMap["upstream_azure"] === "major_outage";
  const isDeeplCrashed =
    componentStatusMap["deepl_api"] === "major_outage";

  let crashedSuppliersCount = 0;
  if (isGooglePaCrashed) crashedSuppliersCount++;
  if (isGoogleV2Crashed) crashedSuppliersCount++;
  if (isMicrosoftCrashed) crashedSuppliersCount++;
  if (isDeeplCrashed) crashedSuppliersCount++;

  const isProbeDegraded =
    componentStatusMap["google_pa"] === "degraded_performance" ||
    componentStatusMap["google_pa"] === "partial_outage" ||
    componentStatusMap["google_v2"] === "degraded_performance" ||
    componentStatusMap["google_v2"] === "partial_outage" ||
    componentStatusMap["upstream_google"] === "degraded_performance" ||
    componentStatusMap["upstream_google"] === "partial_outage" ||
    componentStatusMap["microsoft_translator"] === "degraded_performance" ||
    componentStatusMap["microsoft_translator"] === "partial_outage" ||
    componentStatusMap["upstream_azure"] === "degraded_performance" ||
    componentStatusMap["upstream_azure"] === "partial_outage" ||
    componentStatusMap["deepl_api"] === "degraded_performance" ||
    componentStatusMap["deepl_api"] === "partial_outage";

  let serviceAvailability: ComponentStatus = "operational";
  if (
    coreInfraStatus === "major_outage" ||
    crashedSuppliersCount >= 2
  ) {
    serviceAvailability = "major_outage";
  } else if (
    coreInfraStatus === "degraded_performance" ||
    crashedSuppliersCount >= 1 ||
    isProbeDegraded
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
  const claimedIncidentIds = new Set<string>();
  
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

  function findExistingCombinedIncident(
    compIds: string[],
  ): Incident | undefined {
    for (const [id, inc] of activeExistingIncidents.entries()) {
      if (claimedIncidentIds.has(id)) continue;
      const matchesComp = Array.isArray(inc.componentId)
        ? compIds.some((cid) => inc.componentId.includes(cid))
        : compIds.includes(inc.componentId);
      if (matchesComp) {
        claimedIncidentIds.add(id);
        return inc;
      }
    }
    return undefined;
  }

  function findExistingResolvedIncident(
    compIds: string[],
  ): Incident | undefined {
    for (const [, inc] of resolvedIncidentsMap.entries()) {
      const matchesComp = Array.isArray(inc.componentId)
        ? compIds.some((cid) => inc.componentId.includes(cid))
        : compIds.includes(inc.componentId);
      if (matchesComp) {
        return inc;
      }
    }
    return undefined;
  }

  if (coreInfraStatus !== "operational") {
    const compIds =
      serviceAvailability !== "operational"
        ? ["core_infrastructure", "service_availability"]
        : ["core_infrastructure"];
    const existing = findExistingCombinedIncident(compIds);
    const existingResolved = findExistingResolvedIncident(compIds);
    if (
      !existing &&
      existingResolved &&
      nowUtc.getTime() - new Date(existingResolved.resolvedAt || existingResolved.updatedAt).getTime() < 86_400_000
    ) {
      componentStatusMap["core_infrastructure"] = "operational";
      if (serviceAvailability !== "operational") {
        componentStatusMap["service_availability"] = "operational";
      }
    } else {
      const isRed = coreInfraStatus === "major_outage";
      const nextStatus = isRed
        ? progressStage(existing?.status)
        : existing
          ? existing.status
          : "investigating";
      incidents.push(
        buildIncidentFromTemplate({
          incidentId: existing?.id || generateUnifiedIncidentId(nowUtc),
          componentId: compIds,
          componentName: "Core Infrastructure & Edge Delivery",
          category: "infrastructure",
          severity: isRed ? "critical" : "major",
          currentStatus: nextStatus,
          createdAt: existing?.createdAt || isoTimestamp,
          updatedAt: isoTimestamp,
          existingUpdates: existing?.updates,
        }),
      );
    }
  } else {
    const existing =
      findExistingCombinedIncident(["core_infrastructure", "service_availability"]) ||
      findExistingCombinedIncident(["core_infrastructure"]) ||
      findExistingCombinedIncident(["upstream_github", "core_infrastructure", "service_availability"]);
    if (existing) {
      incidents.push(
        buildIncidentFromTemplate({
          incidentId: existing.id,
          componentId: existing.componentId,
          componentName: existing.title || "Core Infrastructure & Edge Delivery",
          title: existing.title,
          category: "infrastructure",
          severity: existing.severity,
          currentStatus: "resolved",
          createdAt: existing.createdAt,
          updatedAt: isoTimestamp,
          existingUpdates: existing.updates,
        }),
      );
    }
  }

  if (isTursoError) {
    const compIds = ["upstream_storage"];
    const existing = findExistingCombinedIncident(compIds);
    const existingResolved = findExistingResolvedIncident(compIds);
    if (!existing && existingResolved && (nowUtc.getTime() - new Date(existingResolved.resolvedAt || existingResolved.updatedAt).getTime() < 86_400_000)) {
      componentStatusMap["upstream_storage"] = "operational";
    } else {
      const nextStatus = existing ? existing.status : "investigating";
      incidents.push(
        buildIncidentFromTemplate({
          incidentId: existing?.id || generateUnifiedIncidentId(nowUtc),
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
    }
  } else {
    const existing = findExistingCombinedIncident(["upstream_storage"]);
    if (existing && existing.title.includes("Database & Storage Infrastructure")) {
      incidents.push(
        buildIncidentFromTemplate({
          incidentId: existing.id,
          componentId: existing.componentId,
          componentName: existing.title || "Database & Storage Infrastructure",
          title: existing.title,
          category: "storage",
          severity: existing.severity,
          currentStatus: "resolved",
          createdAt: existing.createdAt,
          updatedAt: isoTimestamp,
          existingUpdates: existing.updates,
        }),
      );
    }
  }

  const depDefs = PROVIDER_PLUGINS.map((p) => {
    const check = providerChecks.find((c) => c.plugin.id === p.id);
    let upstreamId: string | undefined;

    if (check?.result?.activeIncidents && Array.isArray(check.result.activeIncidents)) {
      const active = check.result.activeIncidents;
      if (active.length > 0 && active[0].id) {
        upstreamId = active[0].id;
      }
    }

    return {
      id: p.id,
      name: p.name,
      status: componentStatusMap[p.id],
      upstreamId,
    };
  });

  interface EcosystemGroup {
    key: string;
    groupName: string;
    memberIds: string[];
  }

  const ECOSYSTEM_GROUPS: EcosystemGroup[] = [
    {
      key: "google",
      groupName: "Google Cloud & Translation Services",
      memberIds: ["google_pa", "google_v2", "upstream_google"],
    },
    {
      key: "microsoft",
      groupName: "Microsoft Azure & Translation Services",
      memberIds: ["microsoft_translator", "upstream_azure"],
    },
    {
      key: "storage",
      groupName: "Turso & Cloud Storage Services",
      memberIds: ["upstream_storage"],
    },
    {
      key: "cloudflare",
      groupName: "Cloudflare Edge Network",
      memberIds: ["upstream_cloudflare"],
    },
    {
      key: "github",
      groupName: "GitHub Pages & Hosting Infrastructure",
      memberIds: ["upstream_github"],
    },
    {
      key: "deepl",
      groupName: "DeepL Translation API",
      memberIds: ["deepl_api"],
    },
  ];

  const configuredGroupMemberIds = new Set(ECOSYSTEM_GROUPS.flatMap((g) => g.memberIds));
  const remainingPlugins = PROVIDER_PLUGINS.filter((p) => !configuredGroupMemberIds.has(p.id));
  const allEcosystemGroups: EcosystemGroup[] = [
    ...ECOSYSTEM_GROUPS,
    ...remainingPlugins.map((p) => ({
      key: p.id,
      groupName: p.name,
      memberIds: [p.id],
    })),
  ];

  for (const group of allEcosystemGroups) {
    const groupDeps = group.memberIds
      .map((id) => depDefs.find((d) => d.id === id))
      .filter((d): d is (typeof depDefs)[0] => Boolean(d));

    let activeDeps = groupDeps.filter((dep) => {
      const isOverride = maintenanceResult?.activeOverrides.has(dep.id);
      const isAlreadyClaimed = incidents.some((inc) => {
        if (inc.status === "resolved") return false;
        return Array.isArray(inc.componentId)
          ? inc.componentId.includes(dep.id)
          : inc.componentId === dep.id;
      });
      return dep.status !== "operational" && !isOverride && !isAlreadyClaimed;
    });

    const existingGroupInc = findExistingCombinedIncident(group.memberIds);
    const existingResolved = findExistingResolvedIncident(group.memberIds);

    if (activeDeps.length > 0 && !existingGroupInc && existingResolved) {
      const resolvedTime = new Date(existingResolved.resolvedAt || existingResolved.updatedAt).getTime();
      if (nowUtc.getTime() - resolvedTime < 86_400_000) {
        for (const dep of activeDeps) {
          componentStatusMap[dep.id] = "operational";
        }
        activeDeps = [];
      }
    }

    if (activeDeps.length > 0) {
      let compIds = activeDeps.map((d) => d.id);
      const hasCrashedTranslation = activeDeps.some((d) => {
        const pDef = PROVIDER_PLUGINS.find((p) => p.id === d.id);
        return pDef?.group === "translation_engines" && d.status === "major_outage";
      });

      if (hasCrashedTranslation && crashedSuppliersCount >= 2) {
        if (!compIds.includes("service_availability")) {
          compIds.push("service_availability");
        }
      }

      if (existingGroupInc) {
        const prevComps = Array.isArray(existingGroupInc.componentId)
          ? existingGroupInc.componentId
          : [existingGroupInc.componentId];
        compIds = Array.from(new Set([...prevComps, ...compIds]));
      }

      const primaryUpstreamId = activeDeps.find((d) => d.upstreamId)?.upstreamId;
      const unifiedIncidentId =
        existingGroupInc?.id ||
        (primaryUpstreamId
          ? `inc_upstream_${primaryUpstreamId.replace(/[^a-zA-Z0-9_-]/g, "_")}`
          : generateUnifiedIncidentId(nowUtc));

      const hasMajor = activeDeps.some((d) => d.status === "major_outage");
      const incidentTitleName = compIds.length > 1 ? group.groupName : activeDeps[0].name;

      const isStaticTracking = activeDeps.every(
        (d) => d.id === "upstream_google" || d.id === "upstream_azure" || d.status !== "major_outage",
      );
      const nextStatus: IncidentStatus = isStaticTracking
        ? existingGroupInc
          ? existingGroupInc.status
          : "investigating"
        : existingGroupInc?.status === "investigating" || !existingGroupInc
          ? "identified"
          : progressStage(existingGroupInc.status);

      claimedIncidentIds.add(unifiedIncidentId);
      incidents.push(
        buildIncidentFromTemplate({
          incidentId: unifiedIncidentId,
          componentId: compIds,
          componentName: incidentTitleName,
          category: "upstream_provider",
          severity: hasMajor ? "major" : "minor",
          currentStatus: nextStatus,
          createdAt: existingGroupInc?.createdAt || isoTimestamp,
          updatedAt: isoTimestamp,
          customDetail: primaryUpstreamId,
          existingUpdates: existingGroupInc?.updates,
        }),
      );
    } else if (existingGroupInc) {
      claimedIncidentIds.add(existingGroupInc.id);
      incidents.push(
        buildIncidentFromTemplate({
          incidentId: existingGroupInc.id,
          componentId: existingGroupInc.componentId,
          componentName: group.groupName,
          title: existingGroupInc.title,
          category: "upstream_provider",
          severity: existingGroupInc.severity,
          currentStatus: "resolved",
          createdAt: existingGroupInc.createdAt,
          updatedAt: isoTimestamp,
          existingUpdates: existingGroupInc.updates,
        }),
      );
    }
  }

  for (const [id, inc] of resolvedIncidentsMap.entries()) {
    if (!incidents.find((i) => i.id === id)) {
      incidents.push(inc);
    }
  }

  for (const [id, inc] of activeExistingIncidents.entries()) {
    if (!claimedIncidentIds.has(id) && !incidents.find((i) => i.id === id)) {
      const incComps = Array.isArray(inc.componentId) ? inc.componentId : [inc.componentId];
      const allCompsOperational = incComps.every(
        (cid) => (componentStatusMap[cid] || "operational") === "operational",
      );

      if (allCompsOperational) {
        claimedIncidentIds.add(id);
        incidents.push(
          buildIncidentFromTemplate({
            incidentId: inc.id,
            componentId: inc.componentId,
            componentName: typeof inc.title === "string" ? inc.title : "Service Component",
            title: inc.title,
            category: "upstream_provider",
            severity: inc.severity,
            currentStatus: "resolved",
            createdAt: inc.createdAt,
            updatedAt: isoTimestamp,
            existingUpdates: inc.updates,
          }),
        );
      } else {
        incidents.push(inc);
      }
    }
  }

  const activeIncidentsCount = incidents.filter(
    (inc) => {
      if (inc.status === "resolved") return false;
      const isUpstream = Array.isArray(inc.componentId)
        ? inc.componentId.some(c => c.startsWith("upstream_"))
        : inc.componentId.startsWith("upstream_");
      if (overallStatus === "operational" && isUpstream) {
        return false;
      }
      return true;
    }
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

  const cleanSnapshot = reconcileSnapshotHistory(snapshot);

  const cleanDailySnapshots = dailySnapshotsToPersist.filter((d) => {
    const comp = cleanSnapshot.components.find((c) => c.id === d.componentId);
    const todayCell = comp?.history90d.find((h) => h.date === todayDateStr);
    return todayCell && todayCell.status !== "operational";
  });

  return {
    snapshot: cleanSnapshot,
    dailySnapshotsToPersist: cleanDailySnapshots,
  };
}
