import { dispatchWithLookahead } from "./dispatch";
import { expectedCueIds } from "./cueChunks";
import { hasCorruptMarker, repairCorruptMarkers } from "./markerRepair";
import { UNIT_MARKER_PATTERN, parseMarked, unitMarker } from "./markedParse";
import { routeFor, type EngineSession } from "./session";
import { charLength, isLengthPlausible } from "./text";

export const RADIUS_LADDER: readonly number[] = [5, 3, 1, 0];

interface WindowJob {
  suspectId: number;
  payload: string;
  windowIds: number[];
  isSolo: boolean;
}

function buildWindowJob(session: EngineSession, indexOf: Map<number, number>, suspectId: number, radius: number): WindowJob | null {
  const index = indexOf.get(suspectId);
  if (index === undefined) return null;
  const window = session.units.slice(Math.max(0, index - radius), index + radius + 1);
  const isSolo = window.length === 1;
  const { dialect } = session;
  const body = window.map((unit) => `${isSolo ? "" : unitMarker(unit.id)}${dialect.encode(unit.text, unit.term_matches)}`).join("");
  const payload = dialect.wrap(body);
  return charLength(payload) > session.requestChars ? null : { suspectId, payload, windowIds: window.map((unit) => unit.id), isSolo };
}

function validateWindowJob(session: EngineSession, job: WindowJob, flat: string, radius: number): string | null {
  const { dialect } = session;
  let parsed: Map<string, string>;
  if (job.isSolo) {
    parsed = new Map([[String(job.windowIds[0]), dialect.restore(flat)]]);
  } else {
    parsed = parseMarked(flat, UNIT_MARKER_PATTERN, "u", job.windowIds, (piece) => dialect.restore(piece));
    if (!job.windowIds.every((id) => parsed.has(String(id)))) return null;
  }
  const raw = parsed.get(String(job.suspectId));
  const unit = session.unitById.get(job.suspectId);
  if (raw === undefined || !unit) return null;
  const expected = expectedCueIds(unit);
  const text = expected.length ? repairCorruptMarkers(raw, "c", expected) : raw;
  return !hasCorruptMarker(text) && (radius === 0 || isLengthPlausible(unit.text, text)) ? text : null;
}

export async function retryWithWindows(session: EngineSession, suspectIds: number[]): Promise<Map<number, string>> {
  const recovered = new Map<number, string>();
  const indexOf = new Map(session.units.map((unit, i) => [unit.id, i]));
  let pending = suspectIds.filter((id) => indexOf.has(id));
  const skipRadius = new Map<number, number>();

  for (let step = 0; step < RADIUS_LADDER.length; step++) {
    if (!pending.length || session.budget.exhausted) break;
    const radius = RADIUS_LADDER[step]!;
    const speculativeRadius = RADIUS_LADDER[step + 1] || null;

    const jobs = new Map<number, WindowJob>();
    for (const id of pending) {
      if (skipRadius.get(id) === radius) continue;
      const job = buildWindowJob(session, indexOf, id, radius);
      if (job) jobs.set(id, job);
    }
    if (!jobs.size) continue;

    const speculativeJobs = new Map<number, WindowJob>();
    if (speculativeRadius !== null) {
      for (const id of jobs.keys()) {
        const job = buildWindowJob(session, indexOf, id, speculativeRadius);
        if (job) speculativeJobs.set(id, job);
      }
    }

    const payloadsOf = (map: Map<number, WindowJob>) => new Map([...map].map(([id, job]) => [id, job.payload]));
    const results = await dispatchWithLookahead(session, payloadsOf(jobs), payloadsOf(speculativeJobs), routeFor(session, radius === 0));

    const resolved = new Set<number>();
    const accept = (id: number, job: WindowJob, flat: string | undefined, jobRadius: number): boolean => {
      if (flat === undefined) return false;
      const text = validateWindowJob(session, job, flat, jobRadius);
      if (text === null) return false;
      const unit = session.unitById.get(id)!;
      recovered.set(id, session.dialect.applyTerms(text, unit.text, unit.term_matches, session.targetRules));
      resolved.add(id);
      return true;
    };

    for (const [id, job] of jobs) accept(id, job, results.primary.get(id), radius);
    for (const [id, job] of speculativeJobs) {
      if (resolved.has(id)) continue;
      if (!accept(id, job, results.speculative.get(id), speculativeRadius!) && results.speculative.has(id)) skipRadius.set(id, speculativeRadius!);
    }
    pending = pending.filter((id) => !resolved.has(id));
  }
  return recovered;
}
