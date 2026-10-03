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
} from "./maintenance";
import { buildIncidentFromTemplate, TemplateIncidentOptions } from "./templates";
import { componentIdsOf, normalizeId, resolvedAtOf } from "./incidentUtils";
import {
  ProviderReport,
  ALL_STATUS_PROVIDERS,
} from "./providers/index";
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
  ...ALL_STATUS_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    group: p.group,
  })),
];

export const STATUS_PAGE_VERSION = "1.0.0";

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
  dailySnapshotsToPersist: Array<{
    componentId: string;
    status: string;
    uptimeRatio: number;
    totalEvents: number;
    failureEvents: number;
  }>;
}

const DAY_MS = 86_400_000;

const STATIC_TRACKING_IDS = new Set(["upstream_google", "upstream_azure", "upstream_github", "upstream_storage"]);

function isMaintenanceIncident(inc: Incident): boolean {
  return /^inc_(m_|maint-)/.test(inc.id || "") || /(Scheduled|Upcoming|Completed) Maintenance/.test(inc.title || "");
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
    statusDistributionProbe,
    providerReports,
    maintenanceResult,
    nowUtc,
    statusUrl,
    firstSeenDate,
    retentionDays,
  } = inputs;

  const isoTimestamp = nowUtc.toISOString();
  const todayDateStr = isoTimestamp.slice(0, 10);

  const componentStatusMap: Record<string, ComponentStatus> = {};

  for (const report of providerReports) {
    componentStatusMap[report.id] = report.status;
  }

  let coreInfraStatus: ComponentStatus = "operational";
  for (const report of providerReports) {
    if (report.coreImpact?.affected) {
      if (report.coreImpact.status === "major_outage") {
        coreInfraStatus = "major_outage";
        break;
      } else if (report.coreImpact.status === "degraded_performance") {
        coreInfraStatus = "degraded_performance";
      }
    }
  }

  let gatewayErrors = 0;
  for (const [code, count] of windowMetrics.errorsByCode.entries()) {
    if (code >= 1000 && code < 2000) gatewayErrors += count;
  }

  const totalOps = windowMetrics.totalJobs + gatewayErrors;
  if (totalOps > 0 && gatewayErrors > 0) {
    const errorRate = gatewayErrors / totalOps;
    if (errorRate >= 0.05) {
      coreInfraStatus = "major_outage";
    } else if (coreInfraStatus !== "major_outage") {
      coreInfraStatus = "degraded_performance";
    }
  }

  componentStatusMap["core_infrastructure"] = coreInfraStatus;

  const cfReport = providerReports.find((p) => p.id === "upstream_cloudflare");
  const cfPagesStatus = cfReport?.raw?.pagesStatus || "operational";

  componentStatusMap["status_system"] =
    (statusDistributionProbe.success || inputs.statusDistributionColdStart) &&
    cfPagesStatus !== "major_outage"
      ? "operational"
      : "degraded_performance";

  const translationReports = providerReports.filter(
    (p) => p.group === "translation_engines",
  );
  const crashedSuppliersCount = translationReports.filter(
    (p) => componentStatusMap[p.id] === "major_outage",
  ).length;
  const isAnyTranslationDegraded = translationReports.some(
    (p) =>
      componentStatusMap[p.id] === "degraded_performance" ||
      componentStatusMap[p.id] === "partial_outage",
  );

  let serviceAvailability: ComponentStatus = "operational";
  if (coreInfraStatus === "major_outage" || crashedSuppliersCount >= 2) {
    serviceAvailability = "major_outage";
  } else if (
    coreInfraStatus === "degraded_performance" ||
    crashedSuppliersCount >= 1 ||
    isAnyTranslationDegraded
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
  for (const [code, count] of inputs.dayWindowMetrics.errorsByCode.entries()) {
    if (code >= 1000 && code < 2000) dayGatewayErrors += count;
  }
  const dayTotalOps = inputs.dayWindowMetrics.totalJobs + dayGatewayErrors;
  const past24hAvail =
    dayTotalOps > 0
      ? parseFloat((100 * (1 - dayGatewayErrors / dayTotalOps)).toFixed(2))
      : 100.0;

  const incidents: Incident[] = [];
  const nowMs = nowUtc.getTime();
  const purgeLimitMs = inputs.purgeCutoffSec ? inputs.purgeCutoffSec * 1000 : 0;
  const isPurged = (inc: Incident) =>
    purgeLimitMs > 0 &&
    Date.parse(inc.resolvedAt || inc.updatedAt || inc.createdAt || "") >= purgeLimitMs;

  for (const maintenanceIncident of maintenanceResult?.incidents ?? []) {
    if (maintenanceIncident && !isPurged(maintenanceIncident)) incidents.push(maintenanceIncident);
  }

  const ledger = new Map<string, Incident>();
  const claimed = new Set<string>();
  const retentionCutoffMs = nowMs - retentionDays * DAY_MS;
  for (const stored of inputs.existingIncidents ?? []) {
    if (!stored || isPurged(stored) || isMaintenanceIncident(stored)) continue;
    const id = normalizeId(stored.id);
    if (!id) continue;
    const inc: Incident = { ...stored, id, resolvedAt: resolvedAtOf(stored) };
    const settledMs = Date.parse(inc.resolvedAt || inc.updatedAt || inc.createdAt || "");
    if (inc.status === "resolved" && settledMs < retentionCutoffMs) continue;
    ledger.set(id, inc);
  }

  const isOpen = (inc?: Incident): inc is Incident => !!inc && inc.status !== "resolved";

  function locate(componentIds: string[], upstreamIds: string[], excluded: string[] = []): Incident | undefined {
    const candidates = [...ledger.values()].filter(
      (inc) =>
        !inc.manual &&
        !claimed.has(inc.id) &&
        !componentIdsOf(inc).some((c) => excluded.includes(c)),
    );
    const touches = (inc: Incident) => componentIdsOf(inc).some((c) => componentIds.includes(c));
    const settledAt = (inc: Incident) => Date.parse(inc.resolvedAt || inc.updatedAt);

    const sameUpstream = candidates.find((inc) => inc.upstreamIds?.some((id) => upstreamIds.includes(id)));
    if (sameUpstream) return sameUpstream;
    const open = candidates.find((inc) => isOpen(inc) && touches(inc));
    if (open || upstreamIds.length > 0) return open;
    return candidates
      .filter((inc) => touches(inc) && nowMs - settledAt(inc) < DAY_MS)
      .sort((a, b) => settledAt(b) - settledAt(a))[0];
  }

  function emit(options: TemplateIncidentOptions): Incident {
    const inc = buildIncidentFromTemplate(options);
    claimed.add(inc.id);
    incidents.push(inc);
    return inc;
  }

  const isGhCoreImpact = providerReports.some(
    (r) => r.id === "upstream_github" && r.coreImpact?.affected,
  );

  if (coreInfraStatus !== "operational" && !isGhCoreImpact) {
    const compIds =
      serviceAvailability !== "operational"
        ? ["core_infrastructure", "service_availability"]
        : ["core_infrastructure"];
    const existing = locate(compIds, [], ["upstream_github"]);
    const prior = isOpen(existing) ? existing : undefined;
    const isRed = coreInfraStatus === "major_outage";
    emit({
      incidentId: existing?.id,
      componentId: compIds,
      componentName: "Core Infrastructure & Edge Delivery",
      category: "infrastructure",
      severity: isRed ? "major" : "minor",
      currentStatus: isRed ? progressStage(prior?.status) : (prior?.status ?? "investigating"),
      createdAt: existing?.createdAt || isoTimestamp,
      updatedAt: isoTimestamp,
      existingUpdates: existing?.updates,
    });
  } else if (coreInfraStatus === "operational") {
    const existing = locate(["core_infrastructure", "service_availability"], [], ["upstream_github"]);
    if (isOpen(existing)) {
      emit({
        incidentId: existing.id,
        componentId: existing.componentId,
        title: existing.title,
        category: "infrastructure",
        severity: existing.severity,
        currentStatus: "resolved",
        createdAt: existing.createdAt,
        updatedAt: isoTimestamp,
        existingUpdates: existing.updates,
      });
    }
  }

  const depDefs = providerReports.map((report) => ({
    id: report.id,
    name: report.name,
    status: componentStatusMap[report.id],
    upstreamIds: (report.activeIncidents ?? []).map((inc) => inc.id).filter((id): id is string => !!id),
  }));

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
  const remainingPlugins = ALL_STATUS_PROVIDERS.filter((p) => !configuredGroupMemberIds.has(p.id));
  const allEcosystemGroups: EcosystemGroup[] = [
    ...ECOSYSTEM_GROUPS,
    ...remainingPlugins.map((p) => ({
      key: p.id,
      groupName: p.name,
      memberIds: [p.id],
    })),
  ];

  for (const group of allEcosystemGroups) {
    const activeDeps = group.memberIds
      .map((id) => depDefs.find((d) => d.id === id))
      .filter((d): d is (typeof depDefs)[0] => Boolean(d))
      .filter(
        (dep) =>
          dep.status !== "operational" &&
          !maintenanceResult?.activeOverrides.has(dep.id) &&
          !incidents.some((inc) => isOpen(inc) && componentIdsOf(inc).includes(dep.id)),
      );

    const groupTargetIds =
      group.key === "github" && isGhCoreImpact
        ? [...group.memberIds, "core_infrastructure"]
        : group.memberIds;
    const upstreamIds = [...new Set(activeDeps.flatMap((d) => d.upstreamIds))];
    const existing = locate(groupTargetIds, upstreamIds);
    const prior = isOpen(existing) ? existing : undefined;

    if (activeDeps.length > 0) {
      let compIds = activeDeps.map((d) => d.id);
      const hasCrashedTranslation = activeDeps.some((d) => {
        const pDef = ALL_STATUS_PROVIDERS.find((p) => p.id === d.id);
        return pDef?.group === "translation_engines" && d.status === "major_outage";
      });

      if (hasCrashedTranslation && crashedSuppliersCount >= 2) {
        compIds.push("service_availability");
      }

      if (group.key === "github" && isGhCoreImpact && coreInfraStatus !== "operational") {
        compIds.unshift("core_infrastructure");
        if (serviceAvailability !== "operational") compIds.push("service_availability");
      }

      compIds = [...new Set([...componentIdsOf(existing), ...compIds])];

      const hasMajor =
        activeDeps.some((d) => d.status === "major_outage") ||
        (compIds.includes("core_infrastructure") && coreInfraStatus === "major_outage");
      const isStaticTracking = activeDeps.every(
        (d) => STATIC_TRACKING_IDS.has(d.id) || d.status !== "major_outage",
      );
      const currentStatus: IncidentStatus = isStaticTracking
        ? (prior?.status ?? "investigating")
        : !prior || prior.status === "investigating"
          ? "identified"
          : progressStage(prior.status);

      emit({
        incidentId: existing?.id,
        componentId: compIds,
        componentName: compIds.length > 1 ? group.groupName : activeDeps[0].name,
        category: "upstream_provider",
        severity: hasMajor ? "major" : "minor",
        currentStatus,
        createdAt: existing?.createdAt || isoTimestamp,
        updatedAt: isoTimestamp,
        customDetail: upstreamIds[0],
        upstreamIds: [...new Set([...(existing?.upstreamIds ?? []), ...upstreamIds])],
        existingUpdates: existing?.updates,
      });
    } else if (isOpen(existing)) {
      emit({
        incidentId: existing.id,
        componentId: existing.componentId,
        componentName: group.groupName,
        title: existing.title,
        category: "upstream_provider",
        severity: existing.severity,
        currentStatus: "resolved",
        createdAt: existing.createdAt,
        updatedAt: isoTimestamp,
        upstreamIds: existing.upstreamIds,
        existingUpdates: existing.updates,
      });
    }
  }

  for (const inc of ledger.values()) {
    if (claimed.has(inc.id)) continue;
    const comps = componentIdsOf(inc);
    const coveredByOpenIncident = comps.every((cid) =>
      incidents.some((other) => isOpen(other) && componentIdsOf(other).includes(cid)),
    );
    if (!isOpen(inc) || inc.manual) {
      incidents.push(inc);
    } else if (coveredByOpenIncident) {
      continue;
    } else if (comps.every((cid) => (componentStatusMap[cid] || "operational") === "operational")) {
      emit({
        incidentId: inc.id,
        componentId: inc.componentId,
        title: inc.title,
        category: "upstream_provider",
        severity: inc.severity,
        currentStatus: "resolved",
        createdAt: inc.createdAt,
        updatedAt: isoTimestamp,
        upstreamIds: inc.upstreamIds,
        existingUpdates: inc.updates,
      });
    } else {
      incidents.push(inc);
    }
  }

  const externalReferences = Array.from(
    new Map(
      providerReports
        .filter((p) => p.referenceUrl)
        .map((p) => [
          p.referenceUrl!,
          {
            name: simplifyBrandStatusName(p.name),
            url: p.referenceUrl!,
          },
        ]),
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
      activeIncidentsCount: 0,
      past24hAvailability: past24hAvail,
    },
    components,
    incidents,
    externalReferences,
  };

  const cleanSnapshot = reconcileSnapshotHistory(snapshot, undefined, nowMs);

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
