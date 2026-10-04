import { SystemStatusSnapshot } from "../types";
import { AdminAction } from "./routes";
import { componentNameOf } from "../arbitration/components";
import { generateUnifiedIncidentId } from "../incidents/ids";
import {
  deleteManualIncident,
  deleteMessageInSnapshot,
  editMessageInSnapshot,
  pushManualIncident,
  resolveManualIncident,
} from "../snapshot/incidentEdits";
import { deleteSnapshotFromSnapshot, upsertSnapshotInSnapshot } from "../snapshot/cellEdits";

export function withGeneratedIncidentId(action: AdminAction): AdminAction {
  return action.kind === "push_incident" && !action.incidentId
    ? { ...action, incidentId: generateUnifiedIncidentId() }
    : action;
}

export function applySnapshotAction(snapshot: SystemStatusSnapshot, action: AdminAction): SystemStatusSnapshot {
  switch (action.kind) {
    case "resolve_incident":
      return resolveManualIncident(snapshot, action.incidentId, action.message);
    case "delete_incident":
      return deleteManualIncident(snapshot, action.incidentId);
    case "edit_message":
      return editMessageInSnapshot(snapshot, action);
    case "delete_message":
      return deleteMessageInSnapshot(snapshot, action.messageId);
    case "push_incident":
      return pushManualIncident(snapshot, {
        incidentId: action.incidentId ?? generateUnifiedIncidentId(),
        componentId: action.componentId,
        componentName: componentNameOf(action.componentId),
        severity: action.severity,
        status: action.status,
        message: action.message,
      });
    case "delete_snapshot":
      return deleteSnapshotFromSnapshot(snapshot, action.date, action.componentId);
    case "upsert_snapshot":
      return upsertSnapshotInSnapshot(snapshot, action);
    case "trigger_cycle":
      return snapshot;
    default:
      throw new Error(`action "${action.kind}" requires the worker channel`);
  }
}

export const isSnapshotAction = (action: AdminAction): boolean =>
  !["prune_expired", "purge_recent"].includes(action.kind) && !(action.kind === "trigger_cycle" && action.mode === "full");
