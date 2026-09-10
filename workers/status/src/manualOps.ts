import { SystemStatusSnapshot, IncidentSeverity, IncidentStatus, HistoryCellStatus } from "./types";
import { buildManualIncident, generateUnifiedIncidentId, ensureUpdateIds } from "./templates";
import { renderStatusHtml, RenderContext } from "./renderer";
import { renderStatusBadge } from "./badge";
import { Asset } from "./pages";

export function reconcileSnapshotHistory(
  snapshot: SystemStatusSnapshot,
  explicitSnapshotOverrides?: Map<string, { status: HistoryCellStatus; uptime: number }>,
): SystemStatusSnapshot {
  if (!snapshot) return snapshot;
  if (!snapshot.incidents) snapshot.incidents = [];
  if (!snapshot.components) snapshot.components = [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const parsedIncidents = snapshot.incidents.map((inc) => {
    const componentIds = Array.isArray(inc.componentId) ? inc.componentId : [inc.componentId];
    const startDate = (inc.createdAt || todayStr).slice(0, 10);
    let endDate: string;
    if (inc.status !== "resolved") {
      endDate = todayStr;
    } else {
      endDate = (inc.resolvedAt || inc.updatedAt || inc.createdAt || todayStr).slice(0, 10);
    }
    if (endDate < startDate) {
      endDate = startDate;
    }
    return {
      id: inc.id,
      componentIds,
      severity: inc.severity,
      status: inc.status,
      startDate,
      endDate,
    };
  });

  for (const comp of snapshot.components) {
    const compIncidents = parsedIncidents.filter((pi) => pi.componentIds.includes(comp.id));
    const activeCompIncidents = compIncidents.filter((pi) => pi.status !== "resolved");

    if (activeCompIncidents.length > 0) {
      const hasMajorActive = activeCompIncidents.some(
        (pi) => pi.severity === "critical" || pi.severity === "major",
      );
      comp.status = hasMajorActive ? "major_outage" : "degraded_performance";
    } else if (
      comp.status === "major_outage" ||
      comp.status === "degraded_performance" ||
      comp.status === "partial_outage"
    ) {
      comp.status = "operational";
    }

    if (comp.history90d && comp.history90d.length > 0) {
      for (const cell of comp.history90d) {
        if (cell.status === "nodata" && cell.uptime === null) {
          continue;
        }
        const overrideKey = `${comp.id}:${cell.date}`;
        if (explicitSnapshotOverrides && explicitSnapshotOverrides.has(overrideKey)) {
          const ovr = explicitSnapshotOverrides.get(overrideKey)!;
          cell.status = ovr.status;
          cell.uptime = ovr.uptime;
          continue;
        }

        const dayIncidents = compIncidents.filter(
          (pi) => cell.date >= pi.startDate && cell.date <= pi.endDate,
        );

        if (dayIncidents.length > 0) {
          const hasMajor = dayIncidents.some(
            (pi) => pi.severity === "critical" || pi.severity === "major",
          );
          if (hasMajor) {
            cell.status = "outage";
            cell.uptime = cell.uptime !== null && cell.uptime < 90 ? cell.uptime : 0.0;
          } else {
            cell.status = "degraded";
            cell.uptime =
              cell.uptime !== null && cell.uptime < 100 && cell.uptime >= 90
                ? cell.uptime
                : 95.0;
          }
        } else {
          cell.status = "operational";
          cell.uptime = 100.0;
        }
      }
    }

    let activeDays = 0;
    let sumUptime = 0;
    for (const cell of comp.history90d || []) {
      if (cell.status !== "nodata" && typeof cell.uptime === "number") {
        activeDays++;
        sumUptime += cell.uptime;
      }
    }
    comp.uptime90d = activeDays > 0 ? parseFloat((sumUptime / activeDays).toFixed(2)) : 100.0;
  }

  const activeIncidents = snapshot.incidents.filter((i) => i.status !== "resolved");
  snapshot.summary.activeIncidentsCount = activeIncidents.length;

  const anyMajor = snapshot.components.some((c) => c.status === "major_outage");
  const anyDegraded = snapshot.components.some(
    (c) => c.status === "degraded_performance" || c.status === "partial_outage",
  );

  if (anyMajor) {
    snapshot.summary.overallStatus = "major_outage";
  } else if (anyDegraded) {
    snapshot.summary.overallStatus = "degraded";
  } else {
    snapshot.summary.overallStatus = "operational";
  }

  const coreComponents = snapshot.components.filter((c) => c.group === "core_services");
  const targets = coreComponents.length > 0 ? coreComponents : snapshot.components;
  const avgRatio =
    targets.reduce((acc, c) => acc + (c.uptime90d ?? 100), 0) / Math.max(targets.length, 1);
  snapshot.summary.rolling90dRatio = parseFloat(avgRatio.toFixed(2));
  snapshot.summary.past24hAvailability =
    snapshot.summary.overallStatus === "major_outage"
      ? 0
      : snapshot.summary.overallStatus === "degraded"
        ? 90
        : 100;

  return snapshot;
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
  const cleanTarget = params.messageId.trim().replace(/^#/, "");
  if (!cleanTarget) return reconcileSnapshotHistory(snapshot);
  if (!snapshot.incidents) snapshot.incidents = [];

  for (const inc of snapshot.incidents) {
    inc.updates = ensureUpdateIds(inc.updates);
    const updateIndex = inc.updates.findIndex(
      (u) => u.id === cleanTarget || (cleanTarget.length > 0 && u.id?.includes(cleanTarget))
    );
    if (updateIndex >= 0) {
      const u = inc.updates[updateIndex];
      if (params.body && params.body.trim().length > 0) {
        u.body = params.body.trim();
      }
      if (params.status) {
        u.status = params.status;
      }
      if (params.timestamp) {
        u.timestamp = params.timestamp;
      }
      inc.updatedAt = nowIso;
      const lastUpdate = inc.updates[inc.updates.length - 1];
      if (lastUpdate) {
        inc.status = lastUpdate.status;
        if (inc.status === "resolved") {
          inc.resolvedAt = inc.resolvedAt || nowIso;
        } else {
          delete inc.resolvedAt;
        }
      }
      break;
    }
  }

  return reconcileSnapshotHistory(snapshot);
}

export function deleteMessageInSnapshot(
  snapshot: SystemStatusSnapshot,
  messageId: string,
  nowIso: string = new Date().toISOString(),
): SystemStatusSnapshot {
  const cleanTarget = messageId.trim().replace(/^#/, "");
  if (!cleanTarget) return reconcileSnapshotHistory(snapshot);
  if (!snapshot.incidents) snapshot.incidents = [];

  snapshot.incidents = snapshot.incidents
    .map((inc) => {
      inc.updates = ensureUpdateIds(inc.updates);
      inc.updates = inc.updates.filter(
        (u) => u.id !== cleanTarget && !(cleanTarget.length > 0 && u.id?.includes(cleanTarget))
      );
      if (inc.updates.length > 0) {
        inc.updatedAt = nowIso;
        const lastUpdate = inc.updates[inc.updates.length - 1];
        inc.status = lastUpdate.status;
        if (inc.status === "resolved") {
          inc.resolvedAt = inc.resolvedAt || nowIso;
        } else {
          delete inc.resolvedAt;
        }
      }
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
  const cleanTarget = targetIdOrComponent.trim().replace(/^#/, "");
  snapshot.incidents = (snapshot.incidents || []).map((inc) => {
    const incId = (inc.id || "").trim().replace(/^#/, "");
    const matchesId = incId.length > 0 && incId === cleanTarget;
    const matchesComp = Array.isArray(inc.componentId)
      ? inc.componentId.includes(cleanTarget)
      : inc.componentId === cleanTarget;

    if (matchesId || matchesComp) {
      return buildManualIncident({
        incidentId: inc.id || generateUnifiedIncidentId(),
        componentId: inc.componentId,
        title: inc.title,
        severity: inc.severity,
        status: "resolved",
        createdAt: inc.createdAt,
        updatedAt: nowIso,
        message,
        existingUpdates: inc.updates,
      });
    }
    return inc;
  });
  return reconcileSnapshotHistory(snapshot);
}

export function deleteManualIncident(
  snapshot: SystemStatusSnapshot,
  targetIdOrComponent: string,
): SystemStatusSnapshot {
  const cleanTarget = targetIdOrComponent.trim().replace(/^#/, "");
  snapshot.incidents = (snapshot.incidents || []).filter((inc) => {
    const incId = (inc.id || "").trim().replace(/^#/, "");
    if (incId.length > 0 && incId === cleanTarget) return false;
    const comps = Array.isArray(inc.componentId) ? inc.componentId : [inc.componentId];
    if (comps.includes(cleanTarget)) return false;
    return true;
  });
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
  const cleanTarget = params.incidentId.trim().replace(/^#/, "");
  const existingIndex = (snapshot.incidents || []).findIndex((i) => {
    const incId = (i.id || "").trim().replace(/^#/, "");
    return incId.length > 0 && incId === cleanTarget;
  });

  const targetId = existingIndex >= 0 ? snapshot.incidents[existingIndex].id : params.incidentId;
  const existing = existingIndex >= 0 ? snapshot.incidents[existingIndex] : undefined;

  let finalComponentId = params.componentId;
  let finalComponentName = params.componentName;
  if (existing) {
    // If the provided componentId doesn't match any known components (e.g. bypassed validation), fallback to the existing one.
    // Or if we just want to lock the component to whatever the incident already has, we can just use existing's.
    const isProvidedValid = snapshot.components?.some(c => c.id === params.componentId);
    if (!isProvidedValid) {
      finalComponentId = Array.isArray(existing.componentId) ? existing.componentId[0] : existing.componentId;
      const compDef = snapshot.components?.find(c => c.id === finalComponentId);
      if (compDef) finalComponentName = compDef.name;
    }
  }

  const incident = buildManualIncident({
    incidentId: targetId,
    componentId: finalComponentId,
    title: existing?.title || `Manual Notice: ${finalComponentName}`,
    severity: params.severity,
    status: params.status,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    message: params.message,
    existingUpdates: existing?.updates,
  });

  if (!snapshot.incidents) snapshot.incidents = [];
  if (existingIndex >= 0) {
    snapshot.incidents[existingIndex] = incident;
  } else {
    snapshot.incidents.push(incident);
  }

  return reconcileSnapshotHistory(snapshot);
}

export function resolveManualIncidentId(mode: "new" | "update", incidentId?: string, componentId?: string): string {
  if (incidentId && incidentId.trim().length > 0) {
    return incidentId.trim().replace(/^#/, "");
  }
  return generateUnifiedIncidentId();
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

  const uptime = params.uptimeRatio !== undefined && !isNaN(params.uptimeRatio) ? params.uptimeRatio : historyStatus === "operational" ? 100 : historyStatus === "degraded" ? 90 : 0;

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
  return reconcileSnapshotHistory(snapshot, explicitOverrides);
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
