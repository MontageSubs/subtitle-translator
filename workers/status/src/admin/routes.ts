import { HistoryCellStatus, IncidentSeverity, IncidentStatus } from "../types";
import { MONITORED_COMPONENT_IDS } from "../providers/index";
import { jsonResponse, notFoundResponse } from "../http";

export const ADMIN_AUTH_HEADER = "X-Gateway-Automation-Token";

const ADMIN_ROUTE_PREFIX = "/api/admin";

const VALID_SNAPSHOT_STATUSES: HistoryCellStatus[] = ["operational", "degraded", "outage", "nodata"];
const VALID_SEVERITIES: IncidentSeverity[] = ["minor", "major", "critical"];
const VALID_INCIDENT_STATUSES: IncidentStatus[] = ["investigating", "identified", "monitoring", "resolved"];

const COMPONENT_STATUS_TO_INCIDENT_STATUS: Record<string, IncidentStatus> = {
  operational: "resolved",
  degraded: "identified",
  outage: "investigating",
  nodata: "investigating",
};

export type AdminAction =
  | { kind: "trigger_cycle"; mode: "full" | "hardcoded" }
  | { kind: "prune_expired" }
  | { kind: "purge_recent"; days: number }
  | { kind: "delete_snapshot"; date: string; componentId?: string }
  | { kind: "resolve_incident"; incidentId: string; message?: string }
  | { kind: "delete_incident"; incidentId: string }
  | { kind: "edit_message"; messageId: string; body?: string; status?: IncidentStatus }
  | { kind: "delete_message"; messageId: string }
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
    };

export type AdminActionKind = AdminAction["kind"];
export type AdminValidationError = { error: string };
export type AdminResolution = { action: AdminAction } | { response: Response };

type Body = Record<string, unknown>;
type Parsed = AdminAction | AdminValidationError;
type Parser = (body: Body) => Parsed;

const ROUTES: ReadonlyArray<{ method: string; path: string; kind: AdminActionKind }> = [
  { method: "POST", path: "/cycle/trigger", kind: "trigger_cycle" },
  { method: "POST", path: "/data/prune-expired", kind: "prune_expired" },
  { method: "POST", path: "/data/purge", kind: "purge_recent" },
  { method: "DELETE", path: "/snapshots", kind: "delete_snapshot" },
  { method: "PUT", path: "/snapshots", kind: "upsert_snapshot" },
  { method: "POST", path: "/incidents", kind: "push_incident" },
  { method: "DELETE", path: "/incidents", kind: "delete_incident" },
  { method: "POST", path: "/incidents/delete", kind: "delete_incident" },
  { method: "POST", path: "/incidents/resolve", kind: "resolve_incident" },
  { method: "PUT", path: "/messages", kind: "edit_message" },
  { method: "POST", path: "/messages/edit", kind: "edit_message" },
  { method: "DELETE", path: "/messages", kind: "delete_message" },
  { method: "POST", path: "/messages/delete", kind: "delete_message" },
];

const KNOWN_PATHS = new Set(ROUTES.map((route) => route.path));
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const fail = (error: string): AdminValidationError => ({ error });
const isValidationError = (parsed: unknown): parsed is AdminValidationError =>
  typeof parsed === "object" && parsed !== null && "error" in parsed;
const optionalText = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

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

function sanitizeId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/^#/, "");
  return ID_PATTERN.test(trimmed) ? trimmed : undefined;
}

const isValidDate = (value: unknown): value is string =>
  typeof value === "string" && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));

const isValidComponentId = (value: unknown): value is string =>
  typeof value === "string" && MONITORED_COMPONENT_IDS.includes(value);

function toIncidentStatus(value: unknown): IncidentStatus | undefined {
  const raw = typeof value === "string" ? value.trim() : "";
  const mapped = COMPONENT_STATUS_TO_INCIDENT_STATUS[raw] ?? raw;
  return VALID_INCIDENT_STATUSES.includes(mapped as IncidentStatus) ? (mapped as IncidentStatus) : undefined;
}

function parseIncidentReference(body: Body, field: "incidentId" | "messageId"): string | AdminValidationError {
  return sanitizeId(body[field]) ?? fail(`invalid ${field} format`);
}

const PARSERS: Record<AdminActionKind, Parser> = {
  trigger_cycle: (body) => ({ kind: "trigger_cycle", mode: body.mode === "hardcoded" ? "hardcoded" : "full" }),

  prune_expired: () => ({ kind: "prune_expired" }),

  purge_recent: (body) => {
    const days = Number(body.days ?? 1);
    return Number.isFinite(days) && days > 0 ? { kind: "purge_recent", days } : fail("days must be a positive number");
  },

  delete_snapshot: (body) => {
    if (!isValidDate(body.date)) return fail("date must be YYYY-MM-DD");
    if (body.componentId !== undefined && !isValidComponentId(body.componentId)) return fail("unknown componentId");
    return { kind: "delete_snapshot", date: body.date, componentId: body.componentId as string | undefined };
  },

  resolve_incident: (body) => {
    const incidentId = parseIncidentReference(body, "incidentId");
    if (isValidationError(incidentId)) return incidentId;
    const message = optionalText(body.message)?.trim() || undefined;
    return { kind: "resolve_incident", incidentId, message };
  },

  delete_incident: (body) => {
    const incidentId = parseIncidentReference(body, "incidentId");
    return isValidationError(incidentId) ? incidentId : { kind: "delete_incident", incidentId };
  },

  edit_message: (body) => {
    const messageId = parseIncidentReference(body, "messageId");
    if (isValidationError(messageId)) return messageId;
    const hasStatus = typeof body.status === "string" && body.status.trim() !== "";
    const status = hasStatus ? toIncidentStatus(body.status) : undefined;
    if (hasStatus && !status) return fail(`status must be one of ${VALID_INCIDENT_STATUSES.join(", ")}`);
    return { kind: "edit_message", messageId, body: optionalText(body.body) ?? optionalText(body.message), status };
  },

  delete_message: (body) => {
    const messageId = parseIncidentReference(body, "messageId");
    return isValidationError(messageId) ? messageId : { kind: "delete_message", messageId };
  },

  push_incident: (body) => {
    const mode = body.mode === "update" ? "update" : "new";
    const rawIncidentId = optionalText(body.incidentId)?.trim();
    const incidentId = rawIncidentId ? sanitizeId(rawIncidentId) : undefined;
    if (rawIncidentId && !incidentId) return fail("invalid incidentId format");
    if (mode === "update" && !incidentId) return fail("invalid incidentId for update");

    const rawComponentId = body.componentId;
    if (!isValidComponentId(rawComponentId) && mode === "new") return fail("unknown componentId");
    const componentId = isValidComponentId(rawComponentId) ? rawComponentId : optionalText(rawComponentId) || "unknown";

    const severity = body.severity as IncidentSeverity;
    if (!VALID_SEVERITIES.includes(severity)) return fail(`severity must be one of ${VALID_SEVERITIES.join(", ")}`);
    const status = toIncidentStatus(body.status);
    if (!status) return fail(`status must be one of ${VALID_INCIDENT_STATUSES.join(", ")}`);

    return {
      kind: "push_incident",
      mode,
      componentId,
      incidentId,
      severity,
      status,
      message: optionalText(body.message),
      runAutoCheck: body.runAutoCheck === true,
    };
  },

  upsert_snapshot: (body) => {
    if (!isValidDate(body.date)) return fail("date must be YYYY-MM-DD");
    if (!isValidComponentId(body.componentId)) return fail("unknown componentId");
    const status = body.status as HistoryCellStatus;
    if (!VALID_SNAPSHOT_STATUSES.includes(status)) {
      return fail(`status must be one of ${VALID_SNAPSHOT_STATUSES.join(", ")}`);
    }
    const uptimeRatio = Number(body.uptimeRatio ?? (status === "operational" ? 100 : status === "outage" ? 90 : 98));
    if (!Number.isFinite(uptimeRatio) || uptimeRatio < 0 || uptimeRatio > 100) {
      return fail("uptimeRatio must be between 0 and 100");
    }
    const totalEvents = Number(body.totalEvents ?? 1);
    const failureEvents = Number(body.failureEvents ?? ((100 - uptimeRatio) / 100) * totalEvents);
    return { kind: "upsert_snapshot", date: body.date, componentId: body.componentId, status, uptimeRatio, totalEvents, failureEvents };
  },
};

const matchAdminRoute = (method: string, path: string): AdminActionKind | undefined =>
  ROUTES.find((route) => route.method === method && route.path === path)?.kind;

const parseAdminAction = (kind: AdminActionKind, body: Body | null): Parsed => PARSERS[kind](body ?? {});

async function readJsonBody(request: Request): Promise<Body | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Body) : null;
  } catch {
    return null;
  }
}

export async function resolveAdminRequest(
  request: Request,
  adminApiSecret: string | undefined,
): Promise<AdminResolution | null> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith(ADMIN_ROUTE_PREFIX)) return null;

  const route = pathname.slice(ADMIN_ROUTE_PREFIX.length) || "/";
  if (!KNOWN_PATHS.has(route)) return null;

  const presentedToken = request.headers.get(ADMIN_AUTH_HEADER) || "";
  if (!adminApiSecret || !timingSafeEqual(presentedToken, adminApiSecret)) {
    return { response: notFoundResponse() };
  }

  const kind = matchAdminRoute(request.method, route);
  if (!kind) return { response: jsonResponse(404, { success: false, error: "unknown admin route" }) };

  const parsed = parseAdminAction(kind, await readJsonBody(request));
  return isValidationError(parsed)
    ? { response: jsonResponse(400, { success: false, error: parsed.error }) }
    : { action: parsed };
}
