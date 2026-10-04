import { Incident, IncidentSeverity, IncidentStatus, SystemStatusSnapshot } from "../types";
import { buildManualIncident } from "../incidents/templates";
import { componentIdsOf, isOpen, normalizeId } from "../incidents/utils";
import { reconcileSnapshotHistory } from "./reconcile";

export interface ManualIncidentParams {
  incidentId: string;
  componentId: string | string[];
  componentName: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  message?: string;
}

const nowIsoString = (): string => new Date().toISOString();

const withIncidents = (
  snapshot: SystemStatusSnapshot,
  transform: (incidents: Incident[]) => Incident[],
): SystemStatusSnapshot => {
  snapshot.incidents = transform((snapshot.incidents ?? []).filter(Boolean));
  return reconcileSnapshotHistory(snapshot);
};

function syncStateFromUpdates(incident: Incident, nowIso: string): void {
  const last = incident.updates[incident.updates.length - 1];
  if (!last) return;
  incident.updatedAt = nowIso;
  incident.status = last.status;
}

export function editMessageInSnapshot(
  snapshot: SystemStatusSnapshot,
  params: { messageId: string; body?: string; status?: IncidentStatus },
  nowIso: string = nowIsoString(),
): SystemStatusSnapshot {
  const messageId = normalizeId(params.messageId);
  for (const incident of snapshot.incidents ?? []) {
    const update = incident.updates?.find((u) => u.id === messageId);
    if (!update) continue;
    if (params.body?.trim()) update.body = params.body.trim();
    if (params.status) update.status = params.status;
    update.author = "human";
    syncStateFromUpdates(incident, nowIso);
    break;
  }
  return reconcileSnapshotHistory(snapshot);
}

export function deleteMessageInSnapshot(
  snapshot: SystemStatusSnapshot,
  messageId: string,
  nowIso: string = nowIsoString(),
): SystemStatusSnapshot {
  const target = normalizeId(messageId);
  return withIncidents(snapshot, (incidents) =>
    incidents
      .map((incident) => {
        const remaining = (incident.updates ?? []).filter((u) => u.id !== target);
        if (remaining.length === (incident.updates ?? []).length) return incident;
        incident.updates = remaining;
        syncStateFromUpdates(incident, nowIso);
        return incident;
      })
      .filter((incident) => incident.updates.length > 0),
  );
}

export function resolveManualIncident(
  snapshot: SystemStatusSnapshot,
  targetIdOrComponent: string,
  message?: string,
  nowIso: string = nowIsoString(),
): SystemStatusSnapshot {
  const ref = normalizeId(targetIdOrComponent);
  return withIncidents(snapshot, (incidents) =>
    incidents.map((incident) => {
      const isTarget = normalizeId(incident.id) === ref || (isOpen(incident) && componentIdsOf(incident).includes(ref));
      return isTarget
        ? buildManualIncident({
            incidentId: incident.id,
            componentId: incident.componentId,
            title: incident.title,
            severity: incident.severity,
            status: "resolved",
            createdAt: incident.createdAt,
            updatedAt: nowIso,
            message,
            base: incident,
          })
        : incident;
    }),
  );
}

export function deleteManualIncident(snapshot: SystemStatusSnapshot, incidentId: string): SystemStatusSnapshot {
  const target = normalizeId(incidentId);
  return withIncidents(snapshot, (incidents) => incidents.filter((incident) => normalizeId(incident.id) !== target));
}

export function composeManualIncident(
  snapshot: Pick<SystemStatusSnapshot, "incidents" | "components">,
  params: ManualIncidentParams,
  nowIso: string = nowIsoString(),
): { incident: Incident; existing?: Incident } {
  const incidentId = normalizeId(params.incidentId);
  const existing = (snapshot.incidents ?? []).find((incident) => normalizeId(incident.id) === incidentId);
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
  return { incident, existing };
}

export function pushManualIncident(
  snapshot: SystemStatusSnapshot,
  params: ManualIncidentParams,
  nowIso: string = nowIsoString(),
): SystemStatusSnapshot {
  const { incident, existing } = composeManualIncident(snapshot, params, nowIso);
  return withIncidents(snapshot, (incidents) => [...incidents.filter((inc) => inc !== existing), incident]);
}
