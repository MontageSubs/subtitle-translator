import { SystemStatusSnapshot, IncidentSeverity, IncidentStatus } from "./types";
import { buildManualIncident, generateManualIncidentId } from "./templates";
import { renderStatusHtml, RenderContext } from "./renderer";
import { renderStatusBadge } from "./badge";
import { Asset } from "./pages";

export function resolveManualIncident(
  snapshot: SystemStatusSnapshot,
  incidentId: string,
  nowIso: string = new Date().toISOString(),
): SystemStatusSnapshot {
  snapshot.incidents = (snapshot.incidents || []).map((inc) =>
    inc.id === incidentId
      ? buildManualIncident({
          incidentId: inc.id,
          componentId: inc.componentId,
          title: inc.title,
          severity: inc.severity,
          status: "resolved",
          createdAt: inc.createdAt,
          updatedAt: nowIso,
          existingUpdates: inc.updates,
        })
      : inc,
  );
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
  const existing = (snapshot.incidents || []).find((i) => i.id === params.incidentId);
  const incident = buildManualIncident({
    incidentId: params.incidentId,
    componentId: params.componentId,
    title: existing?.title || `Manual Notice: ${params.componentName}`,
    severity: params.severity,
    status: params.status,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    message: params.message,
    existingUpdates: existing?.updates,
  });
  const others = (snapshot.incidents || []).filter((i) => i.id !== params.incidentId);
  snapshot.incidents = [...others, incident];
  snapshot.summary.activeIncidentsCount = snapshot.incidents.filter(
    (i) => i.status !== "resolved",
  ).length;
  return snapshot;
}

export function resolveManualIncidentId(mode: "new" | "update", incidentId?: string): string {
  return mode === "update" && incidentId ? incidentId : `inc_manual_${generateManualIncidentId()}`;
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
