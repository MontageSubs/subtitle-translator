import { formatCueRuns } from "../../logging/cueRuns";
import { UpstreamProviderError } from "../errors";
import type { Unit } from "../../subtitle/types";

const cueIdsOf = (units: Iterable<Unit>): number[] => [...units].flatMap((unit) => unit.spans.map((span) => span.id));

export const unitCues = (unit: Unit): string => formatCueRuns(unit.spans.map((span) => span.id));

export const unitsCues = (units: Iterable<Unit>): string => formatCueRuns(cueIdsOf(units));

export const countCues = (units: Iterable<Unit>): number => cueIdsOf(units).length;

export const markerIds = (ids: readonly string[]): string => formatCueRuns(ids.map((id) => parseInt(id, 10)));

export const failureLabel = (error: unknown): string =>
  error instanceof UpstreamProviderError ? `${error.reason}/${error.status}` : error instanceof Error ? error.name : "unknown";
