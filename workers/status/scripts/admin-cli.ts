import { ADMIN_AUTH_HEADER, resolveAdminRequest } from "../src/admin/routes";
import { applySnapshotAction, isSnapshotAction, withGeneratedIncidentId } from "../src/admin/snapshotActions";
import { egressFetch } from "../src/net/egress";
import { republishSnapshot } from "../src/publish/republish";

interface AdminRequest {
  method: "POST" | "PUT" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
}

interface Inputs {
  action: string;
  componentId: string;
  status: string;
  severity: string;
  days: string;
  date: string;
  uptimeRatio: string;
  incidentId: string;
  messageId: string;
  message: string;
  runAutoCheck: boolean;
}

const ADMIN_ROUTE_PREFIX = "/api/admin";

const parseChoice = (raw = ""): string => /\(([^()]*)\)$/.exec(raw.trim())?.[1] ?? raw.trim();
const keepChars = (value: string, pattern: RegExp): string => value.replace(pattern, "");
const toId = (value: string): string => keepChars(value, /[^a-zA-Z0-9_-]/g);
const post = (path: string, body?: Record<string, unknown>): AdminRequest => ({ method: "POST", path, body });

const REQUEST_BUILDERS: Record<string, (i: Inputs) => AdminRequest> = {
  trigger_cycle: () => post("/cycle/trigger", { mode: "full" }),
  trigger_cycle_hardcoded: () => post("/cycle/trigger", { mode: "hardcoded" }),
  prune_expired: () => post("/data/prune-expired"),
  purge_recent: (i) => post("/data/purge", { days: Number(keepChars(i.days, /\D/g) || 1) }),
  delete_snapshot: (i) => ({
    method: "DELETE",
    path: "/snapshots",
    body: { date: keepChars(i.date, /[^0-9-]/g), componentId: i.componentId || undefined },
  }),
  upsert_snapshot: (i) => ({
    method: "PUT",
    path: "/snapshots",
    body: {
      date: keepChars(i.date, /[^0-9-]/g),
      componentId: i.componentId,
      status: i.status,
      uptimeRatio: i.uptimeRatio ? parseFloat(keepChars(i.uptimeRatio, /[^0-9.]/g)) : undefined,
    },
  }),
  push_incident: (i) => post("/incidents", incidentBody(i, "new")),
  update_incident: (i) => post("/incidents", incidentBody(i, "update")),
  resolve_incident: (i) =>
    post("/incidents/resolve", { incidentId: toId(i.incidentId || i.componentId), message: i.message || undefined }),
  delete_incident: (i) => post("/incidents/delete", { incidentId: toId(i.incidentId || i.componentId) }),
  edit_message: (i) =>
    post("/messages/edit", { messageId: toId(i.messageId || i.incidentId), body: i.message || undefined, status: i.status }),
  delete_message: (i) => post("/messages/delete", { messageId: toId(i.messageId || i.incidentId) }),
};

function incidentBody(i: Inputs, mode: "new" | "update"): Record<string, unknown> {
  return {
    mode,
    componentId: i.componentId || "unknown",
    severity: i.severity,
    status: i.status,
    message: i.message || undefined,
    runAutoCheck: i.runAutoCheck,
    incidentId: toId(i.incidentId) || undefined,
  };
}

function readInputs(env: NodeJS.ProcessEnv): Inputs {
  return {
    action: parseChoice(env.RAW_ACTION),
    componentId: parseChoice(env.RAW_COMPONENT_ID),
    status: parseChoice(env.RAW_STATUS_INPUT),
    severity: parseChoice(env.RAW_SEVERITY),
    days: env.RAW_DAYS ?? "",
    date: env.RAW_DATE ?? "",
    uptimeRatio: env.RAW_UPTIME_RATIO ?? "",
    incidentId: env.RAW_INCIDENT_ID ?? "",
    messageId: env.RAW_MESSAGE_ID ?? "",
    message: env.RAW_MESSAGE ?? "",
    runAutoCheck: env.RUN_AUTO_CHECK === "true",
  };
}

function normalizeWorkerUrl(raw: string): string {
  const trimmed = raw.trim();
  return (/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).replace(/\/+$/, "");
}

const adminHeaders = (token: string): Record<string, string> => ({
  [ADMIN_AUTH_HEADER]: token,
  "Content-Type": "application/json",
});

const serializeBody = ({ body }: AdminRequest): string | undefined => (body ? JSON.stringify(body) : undefined);

async function runWorkerChannel(request: AdminRequest, env: NodeJS.ProcessEnv): Promise<void> {
  const workerUrl = env.STATUS_WORKER_URL?.trim();
  if (!workerUrl) throw new Error("STATUS_WORKER_URL secret is not configured.");
  const token = env.TOKEN ?? "";
  console.log(`::add-mask::${workerUrl}`);
  if (token) console.log(`::add-mask::${token}`);

  console.log(`Dispatching Admin API request: ${request.method} ${request.path}`);
  const response = await egressFetch(`${normalizeWorkerUrl(workerUrl)}${ADMIN_ROUTE_PREFIX}${request.path}`, {
    method: request.method,
    headers: adminHeaders(token),
    body: serializeBody(request),
  });
  console.log(`Worker API HTTP Code: ${response.status}`);
  console.log(`Worker API Response: ${await response.text()}`);
  if (!response.ok) throw new Error(`Worker API call failed with status code ${response.status}`);
}

async function runDirectChannel(request: AdminRequest, env: NodeJS.ProcessEnv): Promise<void> {
  const localSecret = crypto.randomUUID();
  const localRequest = new Request(`https://direct.local${ADMIN_ROUTE_PREFIX}${request.path}`, {
    method: request.method,
    headers: adminHeaders(localSecret),
    body: serializeBody(request),
  });
  const resolution = await resolveAdminRequest(localRequest, localSecret);
  if (!resolution) throw new Error("unknown admin route");
  if ("response" in resolution) throw new Error(await resolution.response.text());

  const action = withGeneratedIncidentId(resolution.action);
  if (!isSnapshotAction(action)) {
    throw new Error("The direct channel supports incidents, snapshots, and static re-renders; probe-driven actions require the worker channel.");
  }

  const result = await republishSnapshot(env, (snapshot) => applySnapshotAction(snapshot, action), {
    baselineWhenMissing: true,
  });
  console.log(JSON.stringify(result));
  if (!result.success) throw new Error(result.error ?? "publish failed");
}

async function main(): Promise<void> {
  const inputs = readInputs(process.env);
  const buildRequest = REQUEST_BUILDERS[inputs.action];
  if (!buildRequest) throw new Error(`Unknown action: ${inputs.action}`);

  const request = buildRequest(inputs);
  if (process.env.CHANNEL === "direct") await runDirectChannel(request, process.env);
  else await runWorkerChannel(request, process.env);
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
