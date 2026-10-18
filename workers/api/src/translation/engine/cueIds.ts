import type { Unit } from "../../subtitle/types";
import { UpstreamProviderError } from "../errors";

export function cuesOf(units: Iterable<Unit>): number[] {
  const ids: number[] = [];
  for (const unit of units) for (const span of unit.spans) ids.push(span.id);
  return ids;
}

export function cuesOfUnitIds(unitById: ReadonlyMap<number, Unit>, unitIds: Iterable<number>): number[] {
  const ids: number[] = [];
  for (const unitId of unitIds) for (const span of unitById.get(unitId)!.spans) ids.push(span.id);
  return ids;
}

export const cuesOfMarkers = (markerIds: Iterable<string>): number[] => Array.from(markerIds, (id) => parseInt(id, 10));

export const failureCode = (error: unknown): string =>
  error instanceof UpstreamProviderError ? `${error.reason}/${error.status}` : error instanceof Error ? error.name : "unknown";
