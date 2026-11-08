import { ComponentStatus, Incident, IncidentSeverity, IncidentUpdate, MaintenancePhase, ScheduledMaintenanceItem } from "../types";
import { egressFetch } from "../upstream/egress";
import { formatUtcTimestamp } from "../timeFormat";
import { generateMessageId, generateUnifiedIncidentId } from "./ids";
import { deriveResolvedAt, isMaintenance, normalizeId } from "./utils";

const FETCH_TIMEOUT_MS = 6000;
const MINUTE_MS = 60_000;
const NOTICE_WINDOW_MIN = 1440;
const DAY_MS = 86_400_000;
const IMMINENT_WINDOW_MIN = 60;
const COLUMN_COUNT = 7;
const CORE_MAINTENANCE_COMPONENT_IDS = ["service_availability", "core_infrastructure"];

export interface MaintenanceEvaluationResult {
  activeOverrides: Map<string, ComponentStatus>;
  isCoreMaintenanceActive: boolean;
  incidents: Incident[];
}

export interface MaintenanceEvaluationOptions {
  storedIncidents: Incident[];
  retentionDays: number;
  appendUpdates: boolean;
}

interface WindowContext {
  item: ScheduledMaintenanceItem;
  nowIso: string;
  startLabel: string;
  endLabel: string;
  minutesToStart: number;
}

interface PhaseUpdate {
  status: IncidentUpdate["status"];
  timestamp: string;
  body: string;
}

function parseSeverity(raw: string): IncidentSeverity {
  const normalized = raw.toLowerCase();
  return normalized === "critical" || normalized === "major" ? normalized : "minor";
}

function parseRow(rawLine: string): ScheduledMaintenanceItem | null {
  const line = rawLine.trim();
  if (!line.startsWith("|") || !line.endsWith("|")) return null;

  const columns = line
    .split("|")
    .map((c) => c.trim())
    .filter((_, index, all) => index > 0 && index < all.length - 1);
  if (columns.length < COLUMN_COUNT) return null;

  const [id, componentId, title, startUtc, endUtc, severity, description] = columns;
  if (id.toLowerCase() === "id" || id.includes("---") || componentId.toLowerCase() === "component_id") return null;

  const start = new Date(startUtc);
  const end = new Date(endUtc);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  return {
    id,
    componentId,
    title,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    severity: parseSeverity(severity),
    description,
  };
}

function parseMaintenanceMarkdown(markdown: string): ScheduledMaintenanceItem[] {
  return markdown.split("\n").flatMap((line) => parseRow(line) ?? []);
}

export async function fetchMaintenanceSchedule(docUrl: string): Promise<ScheduledMaintenanceItem[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await egressFetch(docUrl, {
      signal: controller.signal,
      headers: { Accept: "text/plain, text/markdown" },
    });
    return response.ok ? parseMaintenanceMarkdown(await response.text()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function classifyPhase(item: ScheduledMaintenanceItem, nowMs: number, retentionDays: number): MaintenancePhase | null {
  const startMs = new Date(item.startUtc).getTime();
  const endMs = new Date(item.endUtc).getTime();
  const minutesToStart = Math.round((startMs - nowMs) / MINUTE_MS);

  if (startMs <= nowMs && nowMs <= endMs) return "active";
  if (nowMs < startMs && minutesToStart <= NOTICE_WINDOW_MIN) return "upcoming";
  if (nowMs > endMs && nowMs - endMs <= retentionDays * DAY_MS) return "completed";
  return null;
}

function upcomingUpdate({ item, nowIso, startLabel, endLabel, minutesToStart }: WindowContext): PhaseUpdate {
  const stageNotice =
    minutesToStart <= IMMINENT_WINDOW_MIN
      ? `Notice: Scheduled maintenance will commence in approximately ${Math.max(1, minutesToStart)} minutes (at ${startLabel}). Planned window: ${startLabel} to ${endLabel}.`
      : `Notice: Upcoming maintenance scheduled for ${startLabel} to ${endLabel}. Scope: ${item.componentId}.`;
  return { status: "identified", timestamp: nowIso, body: `${stageNotice} ${item.description}` };
}

function activeUpdate({ item, nowIso, startLabel, endLabel }: WindowContext): PhaseUpdate {
  return {
    status: "monitoring",
    timestamp: nowIso,
    body: `In Progress: Planned maintenance is currently underway (scheduled ${startLabel} - ${endLabel}). ${item.description}`,
  };
}

function completedUpdate({ item, endLabel }: WindowContext): PhaseUpdate {
  return {
    status: "resolved",
    timestamp: item.endUtc,
    body: `Completed: Scheduled maintenance finished at ${endLabel}. All systems verified nominal and fully operational.`,
  };
}

const PHASE_UPDATES: Record<MaintenancePhase, (context: WindowContext) => PhaseUpdate> = {
  upcoming: upcomingUpdate,
  active: activeUpdate,
  completed: completedUpdate,
};

const chronological = (updates: IncidentUpdate[]): IncidentUpdate[] =>
  [...updates].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

const lastPhaseOf = (incident: Incident): MaintenancePhase | undefined =>
  chronological(incident.updates ?? []).reverse().find((update) => update.phase)?.phase;

function withUpdate(incident: Incident, phase: MaintenancePhase, update: PhaseUpdate): Incident {
  const updates = [...(incident.updates ?? []), { id: generateMessageId(), author: "auto" as const, phase, ...update }];
  const latest = chronological(updates).pop()!;
  return {
    ...incident,
    status: latest.status,
    updatedAt: update.timestamp > incident.updatedAt ? update.timestamp : incident.updatedAt,
    resolvedAt: deriveResolvedAt(updates),
    updates,
  };
}

function openIncident(context: WindowContext, phase: MaintenancePhase): Incident {
  const { item, nowIso } = context;
  const createdAt = phase === "upcoming" ? nowIso : item.startUtc;
  return {
    id: generateUnifiedIncidentId(createdAt),
    kind: "maintenance",
    maintenanceId: item.id,
    componentId: item.componentId,
    title: `Scheduled Maintenance: ${item.title}`,
    severity: item.severity,
    status: "identified",
    createdAt,
    updatedAt: createdAt,
    updates: [],
  };
}

function legacyIncidentsOf(item: ScheduledMaintenanceItem, stored: Incident[]): Incident[] {
  const prefix = `inc_${item.id}_`;
  return stored.filter((incident) => !incident.maintenanceId && normalizeId(incident.id).startsWith(prefix));
}

function adoptLegacyIncidents(item: ScheduledMaintenanceItem, legacy: Incident[]): Incident | undefined {
  if (!legacy.length) return undefined;
  const seen = new Set<string>();
  const updates = legacy
    .flatMap((incident) => incident.updates ?? [])
    .filter((update) => !seen.has(`${update.timestamp}|${update.body}`) && seen.add(`${update.timestamp}|${update.body}`));
  const earliest = legacy.reduce((a, b) => (Date.parse(a.createdAt) <= Date.parse(b.createdAt) ? a : b));
  const latest = chronological(updates).pop();
  return {
    ...earliest,
    id: generateUnifiedIncidentId(earliest.createdAt),
    maintenanceId: item.id,
    status: latest?.status ?? earliest.status,
    updatedAt: latest?.timestamp ?? earliest.updatedAt,
    resolvedAt: deriveResolvedAt(updates),
    updates,
  };
}

function cancelledIncident(incident: Incident, nowIso: string): Incident {
  return withUpdate(incident, "completed", {
    status: "resolved",
    timestamp: nowIso,
    body: "Cancelled: This scheduled maintenance was withdrawn from the maintenance schedule. No further action is required.",
  });
}

const isRetained = (incident: Incident, nowMs: number, retentionDays: number): boolean =>
  incident.status !== "resolved" || nowMs - Date.parse(incident.resolvedAt ?? incident.updatedAt) <= retentionDays * DAY_MS;

export function evaluateMaintenanceSchedule(
  items: ScheduledMaintenanceItem[] | null,
  nowUtc: Date,
  { storedIncidents, retentionDays, appendUpdates }: MaintenanceEvaluationOptions,
): MaintenanceEvaluationResult {
  const nowMs = nowUtc.getTime();
  const nowIso = nowUtc.toISOString();
  const activeOverrides = new Map<string, ComponentStatus>();
  let isCoreMaintenanceActive = false;

  const stored = storedIncidents.filter(isMaintenance);
  const byMaintenanceId = new Map(stored.filter((incident) => incident.maintenanceId).map((incident) => [incident.maintenanceId!, incident]));
  const handledIds = new Set<string>();
  const incidents: Incident[] = [];

  for (const item of items ?? []) {
    const phase = classifyPhase(item, nowMs, retentionDays);
    const legacy = legacyIncidentsOf(item, stored);
    legacy.forEach((incident) => handledIds.add(incident.id));
    let incident = byMaintenanceId.get(item.id) ?? adoptLegacyIncidents(item, legacy);
    if (incident?.maintenanceId) handledIds.add(incident.id);

    if (phase === "active") {
      activeOverrides.set(item.componentId, "maintenance");
      isCoreMaintenanceActive ||= CORE_MAINTENANCE_COMPONENT_IDS.includes(item.componentId);
    }

    if (phase && appendUpdates && (!incident || lastPhaseOf(incident) !== phase)) {
      const context: WindowContext = {
        item,
        nowIso,
        startLabel: formatUtcTimestamp(item.startUtc),
        endLabel: formatUtcTimestamp(item.endUtc),
        minutesToStart: Math.round((new Date(item.startUtc).getTime() - nowMs) / MINUTE_MS),
      };
      incident = withUpdate(incident ?? openIncident(context, phase), phase, PHASE_UPDATES[phase](context));
    }
    if (incident) incidents.push(incident);
  }

  const scheduledIds = new Set((items ?? []).map((item) => item.id));
  for (const incident of stored) {
    if (handledIds.has(incident.id)) continue;
    const withdrawn = items !== null && appendUpdates && incident.maintenanceId && !scheduledIds.has(incident.maintenanceId) && incident.status !== "resolved";
    incidents.push(withdrawn ? cancelledIncident(incident, nowIso) : incident);
  }

  return { activeOverrides, isCoreMaintenanceActive, incidents: incidents.filter((incident) => isRetained(incident, nowMs, retentionDays)) };
}
