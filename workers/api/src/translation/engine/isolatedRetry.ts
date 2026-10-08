import { compareMarkerIds } from "../../subtitle/markers";
import { dispatchWithLookahead } from "./dispatch";
import { hasCorruptMarker, repairCorruptMarkers } from "./markerRepair";
import { CUE_MARKER_PATTERN, cueMarkerTag } from "../../subtitle/markers";
import { parseMarked } from "./markedParse";
import { RADIUS_LADDER } from "./windowRetry";
import { routeFor, type EngineSession } from "./session";
import { charLength, isLengthPlausible } from "./text";

export type CueAcceptance = (original: string, candidate: string) => boolean;

interface IsolatedJob {
  payload: string;
  sentIds: string[];
  isSolo: boolean;
}

function buildIsolatedJob(session: EngineSession, [anchorLo, anchorHi]: readonly [number, number], radius: number): IsolatedJob | null {
  const { order, textById, termsById } = session.cueIndex;
  const lo = Math.max(0, anchorLo - radius);
  const hi = Math.min(order.length - 1, anchorHi + radius);
  const isSolo = hi === lo;
  const sentIds: string[] = [];
  let body = "";
  for (let i = lo; i <= hi; i++) {
    const id = order[i]!;
    const text = textById.get(id);
    if (text === undefined) continue;
    body += `${isSolo ? "" : cueMarkerTag(id)}${session.dialect.encode(text, termsById.get(id) ?? [])}`;
    sentIds.push(id);
  }
  const payload = session.dialect.wrap(body);
  return charLength(payload) > session.requestChars ? null : { payload, sentIds, isSolo };
}

function validateIsolatedJob(
  session: EngineSession, job: IsolatedJob, flat: string, remaining: ReadonlySet<string>, accepts?: CueAcceptance
): Map<string, string> {
  const { dialect, cueIndex, targetRules } = session;
  const soloCue = job.isSolo && job.sentIds.length === 1;
  const parsed = soloCue
    ? new Map([[job.sentIds[0]!, repairCorruptMarkers(dialect.restore(flat), "c", job.sentIds)]])
    : parseMarked(flat, CUE_MARKER_PATTERN, "c", job.sentIds, (piece) => dialect.restore(piece));

  const recovered = new Map<string, string>();
  for (const id of remaining) {
    const candidate = parsed.get(id);
    const original = cueIndex.textById.get(id) ?? "";
    if (
      candidate !== undefined && candidate !== "" && !hasCorruptMarker(candidate) &&
      isLengthPlausible(original, candidate) && (!accepts || accepts(original, candidate))
    ) {
      recovered.set(id, dialect.applyTerms(candidate, original, cueIndex.termsById.get(id) ?? [], targetRules));
    }
  }
  return recovered;
}

export async function retryIsolatedCues(
  session: EngineSession, missingByUnit: Map<number, string[]>, accepts?: CueAcceptance
): Promise<Map<number, Map<string, string>>> {
  const position = new Map(session.cueIndex.order.map((id, i) => [id, i]));
  const recoveredByUnit = new Map<number, Map<string, string>>();
  const anchors = new Map<number, [number, number]>();
  const remainingByUnit = new Map<number, Set<string>>();

  for (const [unitId, ids] of missingByUnit) {
    const positions = ids.flatMap((id) => position.get(id) ?? []).sort((a, b) => a - b);
    if (!positions.length) continue;
    anchors.set(unitId, [positions[0]!, positions[positions.length - 1]!]);
    remainingByUnit.set(unitId, new Set(ids));
  }
  const skipRadius = new Map<number, number>();

  const absorb = (unitId: number, job: IsolatedJob, flat: string | undefined): boolean => {
    const remaining = remainingByUnit.get(unitId);
    if (flat === undefined || !remaining) return false;
    const recovered = validateIsolatedJob(session, job, flat, remaining, accepts);
    if (!recovered.size) return true;
    let unitRecovered = recoveredByUnit.get(unitId);
    if (!unitRecovered) recoveredByUnit.set(unitId, (unitRecovered = new Map()));
    for (const [id, text] of recovered) {
      unitRecovered.set(id, text);
      remaining.delete(id);
    }
    if (!remaining.size) remainingByUnit.delete(unitId);
    return true;
  };

  for (let step = 0; step < RADIUS_LADDER.length; step++) {
    if (!remainingByUnit.size || session.budget.exhausted) break;
    const radius = RADIUS_LADDER[step]!;
    const speculativeRadius = RADIUS_LADDER[step + 1] || null;

    const jobs = new Map<number, IsolatedJob>();
    for (const unitId of remainingByUnit.keys()) {
      if (skipRadius.get(unitId) === radius) continue;
      const job = buildIsolatedJob(session, anchors.get(unitId)!, radius);
      if (job) jobs.set(unitId, job);
    }
    if (!jobs.size) continue;

    const speculativeJobs = new Map<number, IsolatedJob>();
    if (speculativeRadius !== null) {
      for (const unitId of jobs.keys()) {
        const job = buildIsolatedJob(session, anchors.get(unitId)!, speculativeRadius);
        if (job) speculativeJobs.set(unitId, job);
      }
    }

    const payloadsOf = (map: Map<number, IsolatedJob>) => new Map([...map].map(([id, job]) => [id, job.payload]));
    const results = await dispatchWithLookahead(session, payloadsOf(jobs), payloadsOf(speculativeJobs), routeFor(session, radius === 0));

    for (const [unitId, job] of jobs) absorb(unitId, job, results.primary.get(unitId));
    for (const [unitId, job] of speculativeJobs) {
      const flat = results.speculative.get(unitId);
      if (flat === undefined) continue;
      absorb(unitId, job, flat);
      if (remainingByUnit.has(unitId)) skipRadius.set(unitId, speculativeRadius!);
    }
  }
  return recoveredByUnit;
}

export const describeRecoveredCues = (recovered: Map<string, string>): string => [...recovered.keys()].sort(compareMarkerIds).join(",");
