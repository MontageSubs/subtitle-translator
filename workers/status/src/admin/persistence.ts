import { isTursoConfigured } from "../config";
import { RECENT_WINDOW_SECONDS, deleteErrorMetrics, deleteHistoryOverrides, upsertHistoryOverride } from "../data/turso";
import { ERROR_CATEGORIES_BY_COMPONENT } from "../signals/errorCodes";
import { componentIdsOf, isOpen, normalizeId } from "../incidents/utils";
import { Incident, SystemStatusSnapshot, TursoConfig } from "../types";
import { AdminAction } from "./routes";

const requiresTurso = (action: AdminAction): boolean =>
  action.kind === "upsert_snapshot" || action.kind === "delete_snapshot";

function findTargetIncidents(snapshot: SystemStatusSnapshot, action: AdminAction): Incident[] {
  if (action.kind !== "resolve_incident" && action.kind !== "delete_incident") return [];
  const ref = normalizeId(action.incidentId);
  return (snapshot.incidents ?? []).filter(
    (incident) =>
      normalizeId(incident.id) === ref ||
      (action.kind === "resolve_incident" && isOpen(incident) && componentIdsOf(incident).includes(ref)),
  );
}

async function clearIncidentSignals(turso: TursoConfig, incidents: Incident[]): Promise<void> {
  const categories = [
    ...new Set(incidents.flatMap((incident) => componentIdsOf(incident)).flatMap((id) => ERROR_CATEGORIES_BY_COMPONENT[id] ?? [])),
  ];
  const startedAt = Math.min(...incidents.map((incident) => Date.parse(incident.createdAt) || Date.now()));
  if (categories.length > 0) await deleteErrorMetrics(turso, startedAt - RECENT_WINDOW_SECONDS * 1000, categories);
}

export async function persistAdminAction(
  action: AdminAction,
  turso: TursoConfig,
  snapshot: SystemStatusSnapshot,
): Promise<void> {
  if (!isTursoConfigured(turso)) {
    if (requiresTurso(action)) throw new Error("history overrides require TURSO_URL and TURSO_AUTH_TOKEN");
    return;
  }

  switch (action.kind) {
    case "upsert_snapshot":
      await upsertHistoryOverride(turso, {
        date: action.date,
        componentId: action.componentId,
        status: action.status,
        uptime: action.uptimeRatio,
      });
      return;
    case "delete_snapshot":
      await deleteHistoryOverrides(turso, action.date, action.componentId);
      return;
    case "resolve_incident":
    case "delete_incident": {
      const targets = findTargetIncidents(snapshot, action);
      if (targets.length > 0) await clearIncidentSignals(turso, targets);
      return;
    }
    default:
      return;
  }
}
