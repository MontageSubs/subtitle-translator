import {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  ScheduledMaintenanceItem,
  ComponentStatus,
} from "./types";

const FETCH_TIMEOUT_MS = 6000;

export interface MaintenanceEvaluationResult {
  activeOverrides: Map<string, ComponentStatus>;
  isCoreMaintenanceActive: boolean;
  incidents: Incident[];
}

export function parseMaintenanceMarkdown(
  markdown: string,
): ScheduledMaintenanceItem[] {
  const lines = markdown.split("\n");
  const items: ScheduledMaintenanceItem[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    const cols = line
      .split("|")
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

    if (cols.length < 7) continue;
    const [id, componentId, title, startUtc, endUtc, severityRaw, description] =
      cols;

    if (
      id.toLowerCase() === "id" ||
      id.includes("---") ||
      componentId.toLowerCase() === "component_id"
    ) {
      continue;
    }

    const startDate = new Date(startUtc);
    const endDate = new Date(endUtc);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      continue;
    }

    let severity: IncidentSeverity = "minor";
    if (severityRaw.toLowerCase() === "critical") severity = "critical";
    else if (severityRaw.toLowerCase() === "major") severity = "major";

    items.push({
      id,
      componentId,
      title,
      startUtc: startDate.toISOString(),
      endUtc: endDate.toISOString(),
      severity,
      description,
    });
  }

  return items;
}

export async function fetchMaintenanceSchedule(
  docUrl: string,
  fallbackMarkdown?: string,
): Promise<ScheduledMaintenanceItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(docUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "MontageSubs-Status-Probe/1.0",
        Accept: "text/plain, text/markdown",
      },
    });
    if (res.ok) {
      const text = await res.text();
      return parseMaintenanceMarkdown(text);
    }
  } catch {
  } finally {
    clearTimeout(timer);
  }

  if (fallbackMarkdown) {
    return parseMaintenanceMarkdown(fallbackMarkdown);
  }
  return [];
}

export function evaluateMaintenanceSchedule(
  items: ScheduledMaintenanceItem[],
  nowUtc: Date,
): MaintenanceEvaluationResult {
  const nowMs = nowUtc.getTime();
  const activeOverrides = new Map<string, ComponentStatus>();
  let isCoreMaintenanceActive = false;
  const incidents: Incident[] = [];

  for (const item of items) {
    const startMs = new Date(item.startUtc).getTime();
    const endMs = new Date(item.endUtc).getTime();

    const diffStartMin = Math.round((startMs - nowMs) / 60000);
    const diffEndMin = Math.round((endMs - nowMs) / 60000);

    const startTimeFmt = new Date(item.startUtc).toUTCString();
    const endTimeFmt = new Date(item.endUtc).toUTCString();

    if (startMs <= nowMs && nowMs <= endMs) {
      activeOverrides.set(item.componentId, "degraded_performance");
      if (
        item.componentId === "service_availability" ||
        item.componentId === "core_infrastructure"
      ) {
        isCoreMaintenanceActive = true;
      }

      incidents.push({
        id: `inc_${item.id}_active`,
        componentId: item.componentId,
        title: `Scheduled Maintenance: ${item.title}`,
        severity: item.severity,
        status: "monitoring",
        createdAt: item.startUtc,
        updatedAt: nowUtc.toISOString(),
        updates: [
          {
            timestamp: nowUtc.toISOString(),
            status: "monitoring",
            body: `In Progress: Planned maintenance is currently underway (scheduled ${startTimeFmt} - ${endTimeFmt}). ${item.description}`,
          },
          {
            timestamp: item.startUtc,
            status: "investigating",
            body: `Identified: Scheduled maintenance window opened at ${startTimeFmt}. Engineering teams are executing planned upgrades.`,
          },
        ],
      });
    } else if (nowMs < startMs && diffStartMin <= 1440) {
      const isImminent = diffStartMin <= 60;
      const stageNotice = isImminent
        ? `Notice: Scheduled maintenance will commence in approximately ${Math.max(1, diffStartMin)} minutes (at ${startTimeFmt}). Planned window: ${startTimeFmt} to ${endTimeFmt}.`
        : `Notice: Upcoming maintenance scheduled for ${startTimeFmt} to ${endTimeFmt}. Scope: ${item.componentId}.`;

      incidents.push({
        id: `inc_${item.id}_upcoming`,
        componentId: item.componentId,
        title: `Upcoming Maintenance: ${item.title}`,
        severity: item.severity,
        status: "identified",
        createdAt: nowUtc.toISOString(),
        updatedAt: nowUtc.toISOString(),
        updates: [
          {
            timestamp: nowUtc.toISOString(),
            status: "identified",
            body: `${stageNotice} ${item.description}`,
          },
        ],
      });
    } else if (nowMs > endMs && -diffEndMin <= 1440) {
      incidents.push({
        id: `inc_${item.id}_completed`,
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
            body: `Completed: Scheduled maintenance finished at ${endTimeFmt}. All systems verified nominal and fully operational.`,
          },
        ],
      });
    }
  }

  return {
    activeOverrides,
    isCoreMaintenanceActive,
    incidents,
  };
}
