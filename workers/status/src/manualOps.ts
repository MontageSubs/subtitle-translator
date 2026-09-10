import { SystemStatusSnapshot, IncidentSeverity, IncidentStatus } from "./types";
import { buildManualIncident, generateUnifiedIncidentId, ensureUpdateIds } from "./templates";
import { renderStatusHtml, RenderContext } from "./renderer";
import { renderStatusBadge } from "./badge";
import { Asset } from "./pages";

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
  if (!cleanTarget) return snapshot;
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

  snapshot.summary.activeIncidentsCount = snapshot.incidents.filter(
    (i) => i.status !== "resolved",
  ).length;
  return snapshot;
}

export function deleteMessageInSnapshot(
  snapshot: SystemStatusSnapshot,
  messageId: string,
  nowIso: string = new Date().toISOString(),
): SystemStatusSnapshot {
  const cleanTarget = messageId.trim().replace(/^#/, "");
  if (!cleanTarget) return snapshot;
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

  snapshot.summary.activeIncidentsCount = snapshot.incidents.filter(
    (i) => i.status !== "resolved",
  ).length;
  return snapshot;
}

export function resolveManualIncident(
  snapshot: SystemStatusSnapshot,
  targetIdOrComponent: string,
  nowIso: string = new Date().toISOString(),
): SystemStatusSnapshot {
  const cleanTarget = targetIdOrComponent.trim().replace(/^#/, "");
  snapshot.incidents = (snapshot.incidents || []).map((inc) => {
    const incId = inc.id.trim().replace(/^#/, "");
    const matchesId = incId === cleanTarget;
    const matchesSuffix =
      cleanTarget.length > 0 &&
      (incId.endsWith(`__${cleanTarget}`) ||
        cleanTarget.endsWith(`__${incId}`) ||
        incId.includes(cleanTarget));
    const matchesComp = Array.isArray(inc.componentId)
      ? inc.componentId.includes(cleanTarget)
      : inc.componentId === cleanTarget;

    if (matchesId || matchesSuffix || matchesComp) {
      return buildManualIncident({
        incidentId: inc.id,
        componentId: inc.componentId,
        title: inc.title,
        severity: inc.severity,
        status: "resolved",
        createdAt: inc.createdAt,
        updatedAt: nowIso,
        existingUpdates: inc.updates,
      });
    }
    return inc;
  });
  snapshot.summary.activeIncidentsCount = snapshot.incidents.filter(
    (i) => i.status !== "resolved",
  ).length;
  return snapshot;
}

export function deleteManualIncident(
  snapshot: SystemStatusSnapshot,
  targetIdOrComponent: string,
): SystemStatusSnapshot {
  const cleanTarget = targetIdOrComponent.trim().replace(/^#/, "");
  snapshot.incidents = (snapshot.incidents || []).filter((inc) => {
    const incId = inc.id.trim().replace(/^#/, "");
    if (incId === cleanTarget) return false;
    if (
      cleanTarget.length > 0 &&
      (incId.endsWith(`__${cleanTarget}`) ||
        cleanTarget.endsWith(`__${incId}`) ||
        incId.includes(cleanTarget))
    ) {
      return false;
    }
    const comps = Array.isArray(inc.componentId) ? inc.componentId : [inc.componentId];
    if (comps.includes(cleanTarget)) return false;
    return true;
  });
  snapshot.summary.activeIncidentsCount = snapshot.incidents.filter(
    (i) => i.status !== "resolved",
  ).length;
  return snapshot;
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
    const incId = i.id.trim().replace(/^#/, "");
    if (incId === cleanTarget) return true;
    if (
      cleanTarget.length > 0 &&
      (incId.endsWith(`__${cleanTarget}`) ||
        cleanTarget.endsWith(`__${incId}`) ||
        incId.includes(cleanTarget))
    ) {
      return true;
    }
    return false;
  });

  const targetId = existingIndex >= 0 ? snapshot.incidents[existingIndex].id : params.incidentId;
  const existing = existingIndex >= 0 ? snapshot.incidents[existingIndex] : undefined;

  const incident = buildManualIncident({
    incidentId: targetId,
    componentId: params.componentId,
    title: existing?.title || `Manual Notice: ${params.componentName}`,
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

  snapshot.summary.activeIncidentsCount = snapshot.incidents.filter(
    (i) => i.status !== "resolved",
  ).length;
  return snapshot;
}

export function resolveManualIncidentId(mode: "new" | "update", incidentId?: string, componentId?: string): string {
  if (incidentId && incidentId.trim().length > 0) {
    return incidentId.trim().replace(/^#/, "");
  }
  return generateUnifiedIncidentId(componentId || "manual");
}

export function renderSnapshotAssets(
  snapshot: SystemStatusSnapshot,
  context: RenderContext,
): Asset[] {
  const html = renderStatusHtml(snapshot, context);
  const badgeSvg = renderStatusBadge(snapshot.summary.overallStatus);
  return [
    { path: "index.html", content: html, contentType: "text/html; charset=utf-8" },
    { path: "status.json", content: JSON.stringify(snapshot, null, 2), contentType: "application/json" },
    { path: "badge.svg", content: badgeSvg, contentType: "image/svg+xml" },
  ];
}
