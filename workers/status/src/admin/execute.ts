import { Env, isTursoConfigured, resolveTursoConfig } from "../config";
import {
  deleteDailySnapshot,
  pruneExpiredMetrics,
  purgeRecentData,
  upsertDailySnapshots,
} from "../data/turso";
import { jsonResponse } from "../http";
import { composeManualIncident } from "../snapshot/incidentEdits";
import { componentNameOf } from "../arbitration/components";
import { componentIdsOf, normalizeId, resolvedAtOf } from "../incidents/utils";
import { fetchPublishedStatusJson } from "../publish/pages";
import { RepublishResult, republishSnapshot } from "../publish/republish";
import { CycleOptions, runStatusCycle } from "../cycle/run";
import { logSystemError } from "../logger";
import { Incident, SystemStatusSnapshot, TursoConfig } from "../types";
import { AdminAction, AdminActionKind } from "./routes";
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

const DAY_MS = 86_400_000;

const respondWith = (result: RepublishResult, failureStatus: number, extra: object = {}): Response =>
  jsonResponse(result.success ? 200 : failureStatus, { ...result, ...extra });

const tursoUnavailable = (): Response => jsonResponse(503, { success: false, error: "turso not configured" });

const rethrowAfterLog = (tag: string) => (error: unknown): never => {
  logSystemError(tag, error);
  throw error;
};

const scheduleCycle = ({ env, ctx }: AdminRuntime, options: CycleOptions = {}): void =>
  ctx.waitUntil(runStatusCycle(env, ctx, { runRetentionPrune: false, ...options }));

const isoDay = (iso: string): string => iso.slice(0, 10);

function datesBetween(startDay: string, endDay: string): string[] {
  const days: string[] = [];
  for (let ms = Date.parse(`${startDay}T00:00:00Z`); ms <= Date.parse(`${endDay}T00:00:00Z`); ms += DAY_MS) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}

async function deleteDailySnapshots(turso: TursoConfig, days: string[], componentIds: string[]): Promise<void> {
  await Promise.all(
    componentIds.flatMap((componentId) =>
      days.map((day) => deleteDailySnapshot(turso, day, componentId).catch(() => {})),
    ),
  );
}

function incidentWindowDays(incident: Incident): string[] {
  const nowIso = new Date().toISOString();
  const endIso = resolvedAtOf(incident) || incident.updatedAt || incident.createdAt || nowIso;
  return datesBetween(isoDay(incident.createdAt || nowIso), isoDay(endIso));
}

const republishAfterCleanup = (
  { env, turso }: AdminRuntime,
  action: AdminAction,
  cleanup: (snapshot: SystemStatusSnapshot) => Promise<void>,
): Promise<RepublishResult> =>
  republishSnapshot(env, async (snapshot) => {
    if (isTursoConfigured(turso)) await cleanup(snapshot);
    return applySnapshotAction(snapshot, action);
  });

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

  async delete_snapshot(action, runtime) {
    if (!isTursoConfigured(runtime.turso)) return tursoUnavailable();
    await deleteDailySnapshot(runtime.turso, action.date, action.componentId).catch(
      rethrowAfterLog("AdminDeleteSnapshot"),
    );
    scheduleCycle(runtime);
    return jsonResponse(200, { success: true });
  },

  async upsert_snapshot(action, runtime) {
    if (!isTursoConfigured(runtime.turso)) return tursoUnavailable();
    await upsertDailySnapshots(runtime.turso, action.date, [
      {
        componentId: action.componentId,
        status: action.status,
        uptimeRatio: action.uptimeRatio,
        totalEvents: action.totalEvents,
        failureEvents: action.failureEvents,
      },
    ]).catch(rethrowAfterLog("AdminUpsertSnapshot"));
    scheduleCycle(runtime);
    return jsonResponse(200, { success: true });
  },

  async resolve_incident(action, runtime) {
    const ref = normalizeId(action.incidentId);
    const result = await republishAfterCleanup(runtime, action, async (snapshot) => {
      const target = snapshot.incidents?.find((i) => normalizeId(i.id) === ref || componentIdsOf(i).includes(ref));
      await deleteDailySnapshots(runtime.turso, [isoDay(new Date().toISOString())], target ? componentIdsOf(target) : [ref]);
    });
    return respondWith(result, 404);
  },

  async delete_incident(action, runtime) {
    const ref = normalizeId(action.incidentId);
    const result = await republishAfterCleanup(runtime, action, async (snapshot) => {
      const target = snapshot.incidents?.find((i) => normalizeId(i.id) === ref);
      if (target) await deleteDailySnapshots(runtime.turso, incidentWindowDays(target), componentIdsOf(target));
    });
    return respondWith(result, 404);
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
