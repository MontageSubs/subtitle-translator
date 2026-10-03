import { Incident, IncidentUpdate } from "./types";

export function normalizeId(raw: unknown): string {
  return String(raw ?? "").trim().replace(/^#/, "");
}

export function componentIdsOf(inc?: Pick<Incident, "componentId">): string[] {
  const raw = inc?.componentId;
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((c): c is string => typeof c === "string");
}

export function deriveResolvedAt(updates: IncidentUpdate[] = []): string | undefined {
  const chronological = [...updates].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  let resolvedAt: string | undefined;
  for (const update of chronological) {
    if (update.status !== "resolved") resolvedAt = undefined;
    else resolvedAt ??= update.timestamp;
  }
  return resolvedAt;
}

export function resolvedAtOf(inc: Incident): string | undefined {
  if (inc.status !== "resolved") return undefined;
  return deriveResolvedAt(inc.updates) ?? inc.resolvedAt ?? inc.updatedAt;
}

export function incidentIntervals(inc: Incident, nowMs: number): Array<[number, number]> {
  const chronological = [...(inc.updates ?? [])].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const intervals: Array<[number, number]> = [];
  let openedAt: number | undefined = Date.parse(inc.createdAt) || nowMs;
  for (const update of chronological) {
    const at = Date.parse(update.timestamp);
    if (update.status !== "resolved") {
      openedAt ??= at;
    } else if (openedAt !== undefined) {
      intervals.push([openedAt, Math.max(at, openedAt)]);
      openedAt = undefined;
    }
  }
  if (openedAt !== undefined) {
    const closedAt = inc.status === "resolved" ? Date.parse(inc.resolvedAt ?? inc.updatedAt) : NaN;
    intervals.push([openedAt, Math.max(Number.isNaN(closedAt) ? nowMs : closedAt, openedAt)]);
  }
  return intervals;
}

export function incidentCoversDate(inc: Incident, date: string, nowMs: number): boolean {
  const dayStart = Date.parse(`${date}T00:00:00Z`);
  const dayEnd = dayStart + 86_400_000;
  return incidentIntervals(inc, nowMs).some(([start, end]) => start < dayEnd && end >= dayStart);
}
