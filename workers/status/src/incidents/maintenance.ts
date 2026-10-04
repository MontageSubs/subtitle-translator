import { ComponentStatus, Incident, IncidentSeverity, ScheduledMaintenanceItem } from "../types";
import { egressFetch } from "../net/egress";
import { formatUtcTimestamp } from "../timeFormat";

const FETCH_TIMEOUT_MS = 6000;
const MINUTE_MS = 60_000;
const NOTICE_WINDOW_MIN = 1440;
const IMMINENT_WINDOW_MIN = 60;
const COLUMN_COUNT = 7;
const CORE_COMPONENT_IDS = ["service_availability", "core_infrastructure"];

export interface MaintenanceEvaluationResult {
  activeOverrides: Map<string, ComponentStatus>;
  isCoreMaintenanceActive: boolean;
  incidents: Incident[];
}

type MaintenancePhase = "active" | "upcoming" | "completed";

interface WindowContext {
  item: ScheduledMaintenanceItem;
  nowIso: string;
  startLabel: string;
  endLabel: string;
  minutesToStart: number;
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

export function parseMaintenanceMarkdown(markdown: string): ScheduledMaintenanceItem[] {
  return markdown.split("\n").flatMap((line) => parseRow(line) ?? []);
}

export async function fetchMaintenanceSchedule(docUrl: string): Promise<ScheduledMaintenanceItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await egressFetch(docUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "MontageSubs-Status-Probe/1.0", Accept: "text/plain, text/markdown" },
    });
    return response.ok ? parseMaintenanceMarkdown(await response.text()) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function classifyPhase(item: ScheduledMaintenanceItem, nowMs: number): MaintenancePhase | null {
  const startMs = new Date(item.startUtc).getTime();
  const endMs = new Date(item.endUtc).getTime();
  const minutesToStart = Math.round((startMs - nowMs) / MINUTE_MS);
  const minutesSinceEnd = -Math.round((endMs - nowMs) / MINUTE_MS);

  if (startMs <= nowMs && nowMs <= endMs) return "active";
  if (nowMs < startMs && minutesToStart <= NOTICE_WINDOW_MIN) return "upcoming";
  if (nowMs > endMs && minutesSinceEnd <= NOTICE_WINDOW_MIN) return "completed";
  return null;
}

function buildActiveIncident({ item, nowIso, startLabel, endLabel }: WindowContext): Incident {
  return {
    id: `inc_${item.id}_active`,
    kind: "maintenance",
    componentId: item.componentId,
    title: `Scheduled Maintenance: ${item.title}`,
    severity: item.severity,
    status: "monitoring",
    createdAt: item.startUtc,
    updatedAt: nowIso,
    updates: [
      {
        timestamp: nowIso,
        status: "monitoring",
        body: `In Progress: Planned maintenance is currently underway (scheduled ${startLabel} - ${endLabel}). ${item.description}`,
      },
      {
        timestamp: item.startUtc,
        status: "investigating",
        body: `Identified: Scheduled maintenance window opened at ${startLabel}. Engineering teams are executing planned upgrades.`,
      },
    ],
  };
}

function buildUpcomingIncident({ item, nowIso, startLabel, endLabel, minutesToStart }: WindowContext): Incident {
  const stageNotice =
    minutesToStart <= IMMINENT_WINDOW_MIN
      ? `Notice: Scheduled maintenance will commence in approximately ${Math.max(1, minutesToStart)} minutes (at ${startLabel}). Planned window: ${startLabel} to ${endLabel}.`
      : `Notice: Upcoming maintenance scheduled for ${startLabel} to ${endLabel}. Scope: ${item.componentId}.`;

  return {
    id: `inc_${item.id}_upcoming`,
    kind: "maintenance",
    componentId: item.componentId,
    title: `Upcoming Maintenance: ${item.title}`,
    severity: item.severity,
    status: "identified",
    createdAt: nowIso,
    updatedAt: nowIso,
    updates: [{ timestamp: nowIso, status: "identified", body: `${stageNotice} ${item.description}` }],
  };
}

function buildCompletedIncident({ item, endLabel }: WindowContext): Incident {
  return {
    id: `inc_${item.id}_completed`,
    kind: "maintenance",
    componentId: item.componentId,
    title: `Completed Maintenance: ${item.title}`,
    severity: item.severity,
    status: "resolved",
    createdAt: item.startUtc,
    updatedAt: item.endUtc,
    resolvedAt: item.endUtc,
    updates: [
      {
        timestamp: item.endUtc,
        status: "resolved",
        body: `Completed: Scheduled maintenance finished at ${endLabel}. All systems verified nominal and fully operational.`,
      },
    ],
  };
}

const INCIDENT_BUILDERS: Record<MaintenancePhase, (context: WindowContext) => Incident> = {
  active: buildActiveIncident,
  upcoming: buildUpcomingIncident,
  completed: buildCompletedIncident,
};

export function evaluateMaintenanceSchedule(
  items: ScheduledMaintenanceItem[],
  nowUtc: Date,
): MaintenanceEvaluationResult {
  const nowMs = nowUtc.getTime();
  const activeOverrides = new Map<string, ComponentStatus>();
  let isCoreMaintenanceActive = false;
  const incidents: Incident[] = [];

  for (const item of items) {
    const phase = classifyPhase(item, nowMs);
    if (!phase) continue;

    if (phase === "active") {
      activeOverrides.set(item.componentId, "maintenance");
      isCoreMaintenanceActive ||= CORE_COMPONENT_IDS.includes(item.componentId);
    }

    incidents.push(
      INCIDENT_BUILDERS[phase]({
        item,
        nowIso: nowUtc.toISOString(),
        startLabel: formatUtcTimestamp(item.startUtc),
        endLabel: formatUtcTimestamp(item.endUtc),
        minutesToStart: Math.round((new Date(item.startUtc).getTime() - nowMs) / MINUTE_MS),
      }),
    );
  }

  return { activeOverrides, isCoreMaintenanceActive, incidents };
}
