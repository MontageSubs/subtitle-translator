import { Incident, IncidentStatus } from "../types";
import { buildIncidentFromTemplate, TemplateIncidentOptions } from "../incidents/templates";
import { componentIdsOf, isHumanResolved, isMaintenance, isOpen, normalizeId, resolvedAtOf } from "../incidents/utils";

const DAY_MS = 86_400_000;
const RECENT_REOPEN_WINDOW_MS = DAY_MS;

export interface IncidentBookConfig {
  nowUtc: Date;
  retentionDays: number;
  purgeCutoffSec?: number;
}

const settledAtMs = (inc: Incident): number => Date.parse(inc.resolvedAt || inc.updatedAt || inc.createdAt || "");

export const isPurged = (inc: Incident, purgeCutoffSec?: number): boolean =>
  !!purgeCutoffSec && settledAtMs(inc) >= purgeCutoffSec * 1000;

export function progressStage(prior?: IncidentStatus): IncidentStatus {
  if (prior === "investigating") return "identified";
  if (prior === "identified" || prior === "monitoring") return "monitoring";
  return "investigating";
}

function loadStoredIncidents(stored: Incident[], config: IncidentBookConfig): Map<string, Incident> {
  const retentionCutoffMs = config.nowUtc.getTime() - config.retentionDays * DAY_MS;
  const ledger = new Map<string, Incident>();
  for (const candidate of stored) {
    if (!candidate || isMaintenance(candidate) || isPurged(candidate, config.purgeCutoffSec)) continue;
    const id = normalizeId(candidate.id);
    if (!id) continue;
    const incident: Incident = { ...candidate, id, resolvedAt: resolvedAtOf(candidate) };
    if (incident.status === "resolved" && settledAtMs(incident) < retentionCutoffMs) continue;
    ledger.set(id, incident);
  }
  return ledger;
}

export class IncidentBook {
  readonly incidents: Incident[] = [];
  private readonly stored: Map<string, Incident>;
  private readonly claimed = new Set<string>();
  private readonly nowMs: number;

  constructor(storedIncidents: Incident[], config: IncidentBookConfig) {
    this.stored = loadStoredIncidents(storedIncidents, config);
    this.nowMs = config.nowUtc.getTime();
  }

  silencedUpstreamIds(): Set<string> {
    return new Set([...this.stored.values()].filter(isHumanResolved).flatMap((inc) => inc.upstreamIds ?? []));
  }

  seed(incidents: Incident[], purgeCutoffSec?: number): void {
    for (const incident of incidents) {
      if (incident && !isPurged(incident, purgeCutoffSec)) this.incidents.push(incident);
    }
  }

  isTrackedOpen(componentId: string): boolean {
    return this.incidents.some((inc) => isOpen(inc) && !isMaintenance(inc) && componentIdsOf(inc).includes(componentId));
  }

  locate(componentIds: string[], upstreamIds: string[], scope?: string[]): Incident | undefined {
    const candidates = [...this.stored.values()].filter(
      (inc) =>
        !inc.manual &&
        !this.claimed.has(inc.id) &&
        (!scope || componentIdsOf(inc).every((c) => scope.includes(c))),
    );
    const touches = (inc: Incident) => componentIdsOf(inc).some((c) => componentIds.includes(c));
    const settledAt = (inc: Incident) => Date.parse(inc.resolvedAt || inc.updatedAt);

    const sameUpstream = candidates.find((inc) => inc.upstreamIds?.some((id) => upstreamIds.includes(id)));
    if (sameUpstream) return sameUpstream;

    const open = candidates.find((inc) => isOpen(inc) && touches(inc));
    if (open || upstreamIds.length > 0) return open;

    return candidates
      .filter((inc) => touches(inc) && this.nowMs - settledAt(inc) < RECENT_REOPEN_WINDOW_MS)
      .sort((a, b) => settledAt(b) - settledAt(a))[0];
  }

  emit(options: TemplateIncidentOptions): Incident {
    const incident = buildIncidentFromTemplate(options);
    this.claimed.add(incident.id);
    this.incidents.push(incident);
    return incident;
  }

  resolve(existing: Incident, category: TemplateIncidentOptions["category"], updatedAt: string): Incident {
    return this.emit({
      incidentId: existing.id,
      componentId: existing.componentId,
      title: existing.title,
      category,
      severity: existing.severity,
      currentStatus: "resolved",
      createdAt: existing.createdAt,
      updatedAt,
      upstreamIds: existing.upstreamIds,
      existingUpdates: existing.updates,
    });
  }

  keep(incident: Incident): void {
    this.incidents.push(incident);
  }

  unclaimed(): Incident[] {
    return [...this.stored.values()].filter((inc) => !this.claimed.has(inc.id));
  }
}
