import { Env, isTursoConfigured, resolveTursoConfig } from "../config";
import { pruneExpiredMetrics, purgeRecentData } from "../data/turso";
import { jsonResponse } from "../http";
import { composeManualIncident } from "../snapshot/incidentEdits";
import { componentNameOf } from "../arbitration/components";
import { fetchPublishedStatusJson } from "../publish/pages";
import { RepublishResult, republishSnapshot } from "../publish/republish";
import { CycleOptions, runStatusCycle } from "../cycle/run";
import { logSystemError } from "../logger";
import { TursoConfig } from "../types";
import { AdminAction, AdminActionKind } from "./routes";
import { republishAdminAction } from "./republishAction";
import { applySnapshotAction, withGeneratedIncidentId } from "./snapshotActions";

interface AdminRuntime {
  env: Env;
  ctx: ExecutionContext;
  turso: TursoConfig;
}

type Handler<K extends AdminActionKind> = (
  action: Extract<AdminAction, { kind: K }>,
  runtime: AdminRuntime,
) => Promise<Response>;

const respondWith = (result: RepublishResult, failureStatus: number, extra: object = {}): Response =>
  jsonResponse(result.success ? 200 : failureStatus, { ...result, ...extra });

const tursoUnavailable = (): Response => jsonResponse(503, { success: false, error: "turso not configured" });

const rethrowAfterLog = (tag: string) => (error: unknown): never => {
  logSystemError(tag, error);
  throw error;
};

const scheduleCycle = ({ env, ctx }: AdminRuntime, options: CycleOptions = {}): void =>
  ctx.waitUntil(runStatusCycle(env, ctx, { runRetentionPrune: false, ...options }));

const HANDLERS: { [K in AdminActionKind]: Handler<K> } = {
  async trigger_cycle(action, runtime) {
    if (action.mode === "hardcoded") {
      return respondWith(await republishSnapshot(runtime.env, (snapshot) => snapshot), 500);
    }
    scheduleCycle(runtime);
    return jsonResponse(202, { success: true, enqueued: true });
  },

  async prune_expired(_action, { turso }) {
    if (!isTursoConfigured(turso)) return tursoUnavailable();
    await pruneExpiredMetrics(turso).catch(rethrowAfterLog("AdminPruneExpired"));
    return jsonResponse(200, { success: true });
  },

  async purge_recent(action, runtime) {
    if (!isTursoConfigured(runtime.turso)) return tursoUnavailable();
    const result = await purgeRecentData(runtime.turso, action.days).catch((error) => {
      logSystemError("AdminPurge", error);
      return null;
    });
    if (!result) return jsonResponse(500, { success: false, error: "purge failed" });
    scheduleCycle(runtime, { purgeCutoffSec: result.cutoffSec });
    return jsonResponse(200, { success: true, ...result });
  },

  async delete_snapshot(action, { env }) {
    return respondWith(await republishAdminAction(env, action), 500);
  },

  async upsert_snapshot(action, { env }) {
    return respondWith(await republishAdminAction(env, action), 500);
  },

  async resolve_incident(action, { env }) {
    return respondWith(await republishAdminAction(env, action), 404);
  },

  async delete_incident(action, { env }) {
    return respondWith(await republishAdminAction(env, action), 404);
  },

  async edit_message(action, { env }) {
    return respondWith(await republishSnapshot(env, (snapshot) => applySnapshotAction(snapshot, action)), 404);
  },

  async delete_message(action, { env }) {
    return respondWith(await republishSnapshot(env, (snapshot) => applySnapshotAction(snapshot, action)), 404);
  },

  async push_incident(rawAction, runtime) {
    const action = withGeneratedIncidentId(rawAction) as Extract<AdminAction, { kind: "push_incident" }>;
    const incidentId = action.incidentId!;

    if (!action.runAutoCheck) {
      const result = await republishSnapshot(runtime.env, (snapshot) => applySnapshotAction(snapshot, action));
      return respondWith(result, 404, { incidentId });
    }

    const published = (await fetchPublishedStatusJson(runtime.env)) ?? { incidents: [], components: [] };
    const { incident } = composeManualIncident(published, {
      incidentId,
      componentId: action.componentId,
      componentName: componentNameOf(action.componentId),
      severity: action.severity,
      status: action.status,
      message: action.message,
    });
    scheduleCycle(runtime, { manualIncident: incident });
    return jsonResponse(202, { success: true, incidentId, enqueued: true });
  },
};

export function executeAdminAction(action: AdminAction, env: Env, ctx: ExecutionContext): Promise<Response> {
  const runtime: AdminRuntime = { env, ctx, turso: resolveTursoConfig(env) };
  const handler = HANDLERS[action.kind] as Handler<AdminActionKind>;
  return handler(action, runtime);
}
