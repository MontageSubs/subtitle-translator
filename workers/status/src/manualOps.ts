import { SystemStatusSnapshot, Incident, IncidentSeverity, IncidentStatus, HistoryCellStatus } from "./types";
import { buildManualIncident, generateUnifiedIncidentId } from "./templates";
import { componentIdsOf, incidentCoversDate, isMaintenance, normalizeId, resolvedAtOf } from "./incidentUtils";
import { renderStatusHtml, RenderContext } from "./renderer";
import { renderStatusBadge } from "./badge";
import { Asset } from "./pages";

const isOpen = (inc: Incident) => inc.status !== "resolved";
const isMajor = (inc: Incident) => inc.severity === "critical" || inc.severity === "major";
const clampUptime = (value: number | null, min: number, max: number, fallback: number) =>
  typeof value === "number" && value >= min && value < max ? value : fallback;

export interface ReconcileOptions {
  overrides?: Map<string, { status: HistoryCellStatus; uptime: number }>;
  nowMs?: number;
  refreshStatuses?: boolean;
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

  for (const comp of snapshot.components) {
    const related = incidents.filter((inc) => !isMaintenance(inc) && componentIdsOf(inc).includes(comp.id));
    const open = related.filter(isOpen);

    if (refreshStatuses) {
      if (open.length > 0) {
        comp.status = open.some(isMajor) ? "major_outage" : "degraded_performance";
      } else if (
        comp.status === "major_outage" ||
        comp.status === "degraded_performance" ||
        comp.status === "partial_outage"
      ) {
        comp.status = "operational";
      }
    }

    for (const cell of comp.history90d ?? []) {
      if (cell.status === "nodata" && cell.uptime === null) continue;
      const override = overrides?.get(`${comp.id}:${cell.date}`);
      if (override) {
        cell.status = override.status;
        cell.uptime = override.uptime;
        continue;
      }
      const covering = related.filter((inc) => incidentCoversDate(inc, cell.date, nowMs));
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

    const tracked = (comp.history90d ?? []).filter(
      (cell) => cell.status !== "nodata" && typeof cell.uptime === "number",
    );
    comp.uptime90d =
      tracked.length > 0
        ? parseFloat((tracked.reduce((sum, cell) => sum + (cell.uptime as number), 0) / tracked.length).toFixed(2))
        : 100;
  }

  const coreComponents = snapshot.components.filter((c) => c.group === "core_services");
  if (refreshStatuses && snapshot.summary.overallStatus !== "maintenance") {
    snapshot.summary.overallStatus = coreComponents.some((c) => c.status === "major_outage")
      ? "major_outage"
      : coreComponents.some((c) => c.status === "degraded_performance" || c.status === "partial_outage")
        ? "degraded"
        : "operational";
  }

  snapshot.summary.activeIncidentsCount = incidents.filter(
    (inc) =>
      isOpen(inc) &&
      !isMaintenance(inc) &&
      !(
        snapshot.summary.overallStatus === "operational" &&
        componentIdsOf(inc).some((c) => c.startsWith("upstream_"))
      ),
  ).length;

  const ratioTargets = coreComponents.length > 0 ? coreComponents : snapshot.components;
  snapshot.summary.rolling90dRatio = parseFloat(
    (ratioTargets.reduce((sum, c) => sum + (c.uptime90d ?? 100), 0) / Math.max(ratioTargets.length, 1)).toFixed(2),
  );

  return snapshot;
}

function syncStateFromUpdates(inc: Incident, nowIso: string): boolean {
  const last = inc.updates[inc.updates.length - 1];
  if (!last) return false;
  inc.updatedAt = nowIso;
  inc.status = last.status;
  return true;
}

export function editMessageInSnapshot(
  snapshot: SystemStatusSnapshot,
  params: {
    messageId: string;
    body?: string;
    status?: IncidentStatus;
    timestamp?: string;
  },
  nowIso: string = new Date().toISOString(),
): SystemStatusSnapshot {
  const messageId = normalizeId(params.messageId);
  for (const inc of snapshot.incidents ?? []) {
    const update = inc.updates?.find((u) => u.id === messageId);
    if (!update) continue;
    if (params.body?.trim()) update.body = params.body.trim();
    if (params.status) update.status = params.status;
    if (params.timestamp) update.timestamp = params.timestamp;
    update.author = "human";
    syncStateFromUpdates(inc, nowIso);
    break;
  }
  return reconcileSnapshotHistory(snapshot);
}

export function deleteMessageInSnapshot(
  snapshot: SystemStatusSnapshot,
  messageId: string,
  nowIso: string = new Date().toISOString(),
): SystemStatusSnapshot {
  const target = normalizeId(messageId);
  snapshot.incidents = (snapshot.incidents ?? [])
    .filter(Boolean)
    .map((inc) => {
      const remaining = (inc.updates ?? []).filter((u) => u.id !== target);
      if (remaining.length === (inc.updates ?? []).length) return inc;
      inc.updates = remaining;
      syncStateFromUpdates(inc, nowIso);
      return inc;
    })
    .filter((inc) => inc.updates.length > 0);
  return reconcileSnapshotHistory(snapshot);
}

export function resolveManualIncident(
  snapshot: SystemStatusSnapshot,
  targetIdOrComponent: string,
  message?: string,
  nowIso: string = new Date().toISOString(),
): SystemStatusSnapshot {
  const ref = normalizeId(targetIdOrComponent);
  snapshot.incidents = (snapshot.incidents ?? []).filter(Boolean).map((inc) => {
    const isTarget = normalizeId(inc.id) === ref || (isOpen(inc) && componentIdsOf(inc).includes(ref));
    return isTarget
      ? buildManualIncident({
          incidentId: inc.id,
          componentId: inc.componentId,
          title: inc.title,
          severity: inc.severity,
          status: "resolved",
          createdAt: inc.createdAt,
          updatedAt: nowIso,
          message,
          base: inc,
        })
      : inc;
  });
  return reconcileSnapshotHistory(snapshot);
}

export function deleteManualIncident(
  snapshot: SystemStatusSnapshot,
  incidentId: string,
): SystemStatusSnapshot {
  const target = normalizeId(incidentId);
  snapshot.incidents = (snapshot.incidents ?? []).filter(Boolean).filter((inc) => normalizeId(inc.id) !== target);
  return reconcileSnapshotHistory(snapshot);
}

export function pushManualIncident(
  snapshot: SystemStatusSnapshot,
  params: {
    incidentId: string;
    componentId: string | string[];
    componentName: string;
    severity: IncidentSeverity;
    status: IncidentStatus;
    message?: string;
  },
  nowIso: string = new Date().toISOString(),
): SystemStatusSnapshot {
  const incidentId = normalizeId(params.incidentId);
  const existing = (snapshot.incidents ?? []).find((inc) => normalizeId(inc.id) === incidentId);
  const primaryId = existing ? componentIdsOf(existing)[0] : undefined;
  const componentName = snapshot.components?.find((c) => c.id === primaryId)?.name ?? params.componentName;

  const incident = buildManualIncident({
    incidentId,
    componentId: existing ? existing.componentId : params.componentId,
    title: existing?.title || `Manual Notice: ${componentName}`,
    severity: params.severity,
    status: params.status,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    message: params.message,
    base: existing,
  });

  snapshot.incidents = [...(snapshot.incidents ?? []).filter((inc) => inc !== existing), incident];
  return reconcileSnapshotHistory(snapshot);
}

export function deleteSnapshotFromSnapshot(
  snapshot: SystemStatusSnapshot,
  date: string,
  componentId?: string,
): SystemStatusSnapshot {
  if (!date || !snapshot.components) return snapshot;

  for (const comp of snapshot.components) {
    if (!componentId || comp.id === componentId) {
      if (comp.history90d) {
        const cell = comp.history90d.find((h) => h.date === date);
        if (cell) {
          cell.status = "operational";
          cell.uptime = 100.0;
        }
      }
    }
  }
  return reconcileSnapshotHistory(snapshot);
}

export function upsertSnapshotInSnapshot(
  snapshot: SystemStatusSnapshot,
  params: {
    date: string;
    componentId: string;
    status?: string;
    uptimeRatio?: number;
  },
): SystemStatusSnapshot {
  if (!params.date || !params.componentId || !snapshot.components) return snapshot;

  const comp = snapshot.components.find((c) => c.id === params.componentId);
  if (!comp) return snapshot;

  if (!comp.history90d) comp.history90d = [];

  let historyStatus: "operational" | "degraded" | "outage" | "nodata" = "operational";
  if (params.status === "degraded" || params.status === "degraded_performance") historyStatus = "degraded";
  else if (params.status === "outage" || params.status === "partial_outage" || params.status === "major_outage") historyStatus = "outage";
  else if (params.status === "nodata" || params.status === "no_data") historyStatus = "nodata";

  const uptime =
    params.uptimeRatio !== undefined && !isNaN(params.uptimeRatio)
      ? params.uptimeRatio
      : historyStatus === "operational"
        ? 100
        : historyStatus === "degraded"
          ? 98
          : 90;

  const existingIdx = comp.history90d.findIndex((h) => h.date === params.date);
  if (existingIdx >= 0) {
    comp.history90d[existingIdx].status = historyStatus;
    comp.history90d[existingIdx].uptime = uptime;
  } else {
    comp.history90d.push({
      date: params.date,
      status: historyStatus,
      uptime,
    });
    comp.history90d.sort((a, b) => a.date.localeCompare(b.date));
  }

  const explicitOverrides = new Map<string, { status: HistoryCellStatus; uptime: number }>();
  explicitOverrides.set(`${params.componentId}:${params.date}`, { status: historyStatus, uptime });
  return reconcileSnapshotHistory(snapshot, { overrides: explicitOverrides });
}

export function renderSnapshotAssets(
  snapshot: SystemStatusSnapshot,
  context: RenderContext,
): Asset[] {
  const cleanSnapshot = reconcileSnapshotHistory(snapshot);
  const html = renderStatusHtml(cleanSnapshot, context);
  const badgeSvg = renderStatusBadge(cleanSnapshot.summary.overallStatus);
  const headersContent = `/*\n  Cache-Control: public, max-age=0, must-revalidate\n/status.json\n  Cache-Control: public, max-age=0, must-revalidate\n  Access-Control-Allow-Origin: *\n/badge.svg\n  Cache-Control: public, max-age=60, must-revalidate\n  Access-Control-Allow-Origin: *\n`;
  return [
    { path: "_headers", content: headersContent, contentType: "text/plain; charset=utf-8" },
    { path: "index.html", content: html, contentType: "text/html; charset=utf-8" },
    { path: "status.json", content: JSON.stringify(cleanSnapshot, null, 2), contentType: "application/json" },
    { path: "badge.svg", content: badgeSvg, contentType: "image/svg+xml" },
  ];
}
