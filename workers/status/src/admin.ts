import { HistoryCellStatus, IncidentSeverity, IncidentStatus } from "./types";
import { MONITORED_COMPONENT_IDS } from "./providers/index";

export const ADMIN_AUTH_HEADER = "X-Gateway-Automation-Token";

const VALID_SNAPSHOT_STATUSES: HistoryCellStatus[] = [
  "operational",
  "degraded",
  "outage",
  "nodata",
];

const VALID_SEVERITIES: IncidentSeverity[] = ["minor", "major", "critical"];
const VALID_INCIDENT_STATUSES: IncidentStatus[] = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];

export type AdminAction =
  | { kind: "trigger_cycle"; mode: "full" | "hardcoded" }
  | { kind: "prune_expired" }
  | { kind: "purge_recent"; days: number }
  | { kind: "delete_snapshot"; date: string; componentId?: string }
  | { kind: "resolve_incident"; incidentId: string }
  | {
      kind: "upsert_snapshot";
      date: string;
      componentId: string;
      status: HistoryCellStatus;
      uptimeRatio: number;
      totalEvents: number;
      failureEvents: number;
    }
  | {
      kind: "push_incident";
      mode: "new" | "update";
      componentId: string;
      incidentId?: string;
      severity: IncidentSeverity;
      status: IncidentStatus;
      message?: string;
      runAutoCheck: boolean;
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
const INCIDENT_ID_PATTERN = /^#?inc_[a-zA-Z0-9_-]+$/;

function sanitizeIncidentId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/^#/, "");
  return INCIDENT_ID_PATTERN.test(value.trim()) ? trimmed : undefined;
}

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
  adminPathSecret: string | undefined,
  adminApiSecret: string | undefined,
): Promise<AdminResolution | null> {
  const url = new URL(request.url);
  if (!adminPathSecret) {
    return null;
  }
  const prefix = `/ops-${adminPathSecret}`;
  if (!url.pathname.startsWith(prefix)) {
    return null;
  }

  const route = url.pathname.slice(prefix.length) || "/";

  if (route === "/health" && request.method === "GET") {
    return { action: { kind: "health" } };
  }

  const presentedToken = request.headers.get(ADMIN_AUTH_HEADER) || "";
  const isAuthorized = Boolean(adminApiSecret) && timingSafeEqual(presentedToken, adminApiSecret!);
  if (!isAuthorized) {
    return { response: jsonResponse(404, { success: false }) };
  }

  if (route === "/cycle/trigger" && request.method === "POST") {
    const body = await readJsonBody(request);
    const mode = body?.mode === "hardcoded" ? "hardcoded" : "full";
    return { action: { kind: "trigger_cycle", mode } };
  }

  if (route === "/data/prune-expired" && request.method === "POST") {
    return { action: { kind: "prune_expired" } };
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

  if (route === "/incidents/resolve" && request.method === "POST") {
    const body = await readJsonBody(request);
    const incidentId = sanitizeIncidentId(body?.incidentId);
    if (!incidentId) {
      return { response: jsonResponse(400, { success: false, error: "invalid incidentId format" }) };
    }
    return { action: { kind: "resolve_incident", incidentId } };
  }

  if (route === "/incidents" && request.method === "POST") {
    const body = await readJsonBody(request);
    const mode = body?.mode === "update" ? "update" : "new";
    if (!isValidComponentId(body?.componentId)) {
      return { response: jsonResponse(400, { success: false, error: "unknown componentId" }) };
    }
    const incidentId = sanitizeIncidentId(body?.incidentId);
    if (mode === "update" && !incidentId) {
      return { response: jsonResponse(400, { success: false, error: "invalid incidentId for update" }) };
    }
    const severity = body?.severity as IncidentSeverity;
    if (!VALID_SEVERITIES.includes(severity)) {
      return { response: jsonResponse(400, { success: false, error: `severity must be one of ${VALID_SEVERITIES.join(", ")}` }) };
    }
    const status = body?.status as IncidentStatus;
    if (!VALID_INCIDENT_STATUSES.includes(status)) {
      return { response: jsonResponse(400, { success: false, error: `status must be one of ${VALID_INCIDENT_STATUSES.join(", ")}` }) };
    }
    return {
      action: {
        kind: "push_incident",
        mode,
        componentId: body!.componentId as string,
        incidentId: incidentId || (typeof body?.incidentId === "string" ? body.incidentId : undefined),
        severity,
        status,
        message: typeof body?.message === "string" ? body.message : undefined,
        runAutoCheck: body?.runAutoCheck === true,
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
