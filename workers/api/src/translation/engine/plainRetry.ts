import type { Unit } from "../../subtitle/types";
import { dispatchPayloads } from "./dispatch";
import { expectedCueIds } from "./cueChunks";
import { hasCorruptMarker, repairCorruptMarkers } from "./markerRepair";
import { routeFor, type EngineSession } from "./session";
import { isLengthPlausible } from "./text";

export type PlainAcceptance = (unit: Unit, rawText: string) => boolean;

export const acceptsRecoveredUnit: PlainAcceptance = (unit, text) => !hasCorruptMarker(text) && isLengthPlausible(unit.text, text);

export const acceptsRetriedUnit: PlainAcceptance = (unit, text) => isLengthPlausible(unit.text, text);

export async function retryUnitsIndividually(session: EngineSession, units: Unit[], accepts: PlainAcceptance): Promise<Map<number, string>> {
  const recovered = new Map<number, string>();
  if (!units.length) return recovered;
  const { dialect, targetRules } = session;
  const payloads = units.map((unit) => dialect.wrap(dialect.encode(unit.text, unit.term_matches)));
  const results = await dispatchPayloads(session, payloads, routeFor(session));

  units.forEach((unit, i) => {
    const flat = results[i];
    if (!flat) return;
    const expected = expectedCueIds(unit);
    const restored = dialect.restore(flat);
    const raw = expected.length ? repairCorruptMarkers(restored, "c", expected) : restored;
    if (raw && accepts(unit, raw)) recovered.set(unit.id, dialect.applyTerms(raw, unit.text, unit.term_matches, targetRules));
  });
  return recovered;
}
