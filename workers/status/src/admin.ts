import { HistoryCellStatus } from "./types";
import { MONITORED_COMPONENT_IDS } from "./providers/index";

export const ADMIN_PATH_PREFIX = "/api/admin";
export const ADMIN_AUTH_HEADER = "X-Gateway-Automation-Token";

const VALID_SNAPSHOT_STATUSES: HistoryCellStatus[] = [
  "operational",
  "degraded",
  "outage",
  "nodata",
];

export type AdminAction =
  | { kind: "trigger_cycle" }
  | { kind: "purge_recent"; days: number }
  | { kind: "delete_snapshot"; date: string; componentId?: string }
  | {
      kind: "upsert_snapshot";
      date: string;
      componentId: string;
      status: HistoryCellStatus;
      uptimeRatio: number;
      totalEvents: number;
      failureEvents: number;
    }
  | { kind: "health" };

export type AdminResolution = { action: AdminAction } | { response: Response };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  const length = Math.max(bytesA.length, bytesB.length, 1);
  let mismatch = bytesA.length === bytesB.length ? 0 : 1;
  for (let i = 0; i < length; i++) {
    mismatch |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return mismatch === 0;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function isValidComponentId(value: unknown): value is string {
  return typeof value === "string" && MONITORED_COMPONENT_IDS.includes(value);
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function resolveAdminRequest(
  request: Request,
  adminApiSecret: string | undefined,
): Promise<AdminResolution | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(ADMIN_PATH_PREFIX)) {
    return null;
  }

  const route = url.pathname.slice(ADMIN_PATH_PREFIX.length) || "/";

  if (route === "/health" && request.method === "GET") {
    return { action: { kind: "health" } };
  }

  const presentedToken = request.headers.get(ADMIN_AUTH_HEADER) || "";
  const isAuthorized = Boolean(adminApiSecret) && timingSafeEqual(presentedToken, adminApiSecret!);
  if (!isAuthorized) {
    return { response: jsonResponse(401, { success: false, error: "unauthorized" }) };
  }

  if (route === "/cycle/trigger" && request.method === "POST") {
    return { action: { kind: "trigger_cycle" } };
  }

  if (route === "/data/purge" && request.method === "POST") {
    const body = await readJsonBody(request);
    const days = Number(body?.days ?? 1);
    if (!Number.isFinite(days) || days <= 0) {
      return { response: jsonResponse(400, { success: false, error: "days must be a positive number" }) };
    }
    return { action: { kind: "purge_recent", days } };
  }

  if (route === "/snapshots" && request.method === "DELETE") {
    const body = await readJsonBody(request);
    if (!isValidDate(body?.date)) {
      return { response: jsonResponse(400, { success: false, error: "date must be YYYY-MM-DD" }) };
    }
    if (body?.componentId !== undefined && !isValidComponentId(body.componentId)) {
      return { response: jsonResponse(400, { success: false, error: "unknown componentId" }) };
    }
    return {
      action: {
        kind: "delete_snapshot",
        date: body!.date as string,
        componentId: body?.componentId as string | undefined,
      },
    };
  }

  if (route === "/snapshots" && request.method === "PUT") {
    const body = await readJsonBody(request);
    if (!isValidDate(body?.date)) {
      return { response: jsonResponse(400, { success: false, error: "date must be YYYY-MM-DD" }) };
    }
    if (!isValidComponentId(body?.componentId)) {
      return { response: jsonResponse(400, { success: false, error: "unknown componentId" }) };
    }
    const status = body?.status as HistoryCellStatus;
    if (!VALID_SNAPSHOT_STATUSES.includes(status)) {
      return {
        response: jsonResponse(400, {
          success: false,
          error: `status must be one of ${VALID_SNAPSHOT_STATUSES.join(", ")}`,
        }),
      };
    }
    const uptimeRatio = Number(body?.uptimeRatio ?? (status === "operational" ? 100 : status === "outage" ? 0 : 98));
    if (!Number.isFinite(uptimeRatio) || uptimeRatio < 0 || uptimeRatio > 100) {
      return { response: jsonResponse(400, { success: false, error: "uptimeRatio must be between 0 and 100" }) };
    }
    const totalEvents = Number(body?.totalEvents ?? 1);
    const failureEvents = Number(body?.failureEvents ?? (100 - uptimeRatio) / 100 * totalEvents);
    return {
      action: {
        kind: "upsert_snapshot",
        date: body!.date as string,
        componentId: body!.componentId as string,
        status,
        uptimeRatio,
        totalEvents,
        failureEvents,
      },
    };
  }

  return { response: jsonResponse(404, { success: false, error: "unknown admin route" }) };
}
