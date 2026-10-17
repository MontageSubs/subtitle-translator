import type { Unit } from "../../../subtitle/types";
import { markerIds, unitCues, unitsCues } from "../cueLabels";
import { expectedCueIds, missingCueIds, patchMissingCues, singleCueId } from "../cueChunks";
import { retryIsolatedCues } from "./isolatedRetry";
import { findLeakedCueIds } from "./leaks";
import { repairLatinWordLeaks } from "./latinLeaks";
import { hasCorruptMarker, hasMarkerLeak, repairCorruptMarkers } from "../markerRepair";
import { acceptsRecoveredUnit, acceptsRetriedUnit, retryUnitsIndividually } from "./plainRetry";
import type { EngineSession } from "../session";
import { applyTermReplacements, hasTranslatableContent } from "../terms";
import { hasContent, isLengthPlausible } from "../text";
import { hasStyleTag } from "../../../subtitle/styleTags";
import { isLeakedUntranslated } from "../../../subtitle/common/untranslated";
import { isUntranslated } from "./untranslated";
import type { UnitTranslations } from "../../types";
import { retryWithWindows } from "./windowRetry";

function describeOutcome(label: string, wantedByUnit: Map<number, string[]>, recoveredByUnit: Map<number, Map<string, string>>): string {
  const recovered: string[] = [];
  const unresolved: string[] = [];
  for (const [id, wanted] of wantedByUnit) {
    const got = recoveredByUnit.get(id);
    for (const cueId of wanted) (got?.has(cueId) ? recovered : unresolved).push(cueId);
  }
  return `retry ${label} fixed=${markerIds(recovered) || "none"} unresolved=${markerIds(unresolved) || "none"}`;
}

async function retryUntranslated(session: EngineSession, results: UnitTranslations, pending: Unit[]): Promise<void> {
  const candidates = pending.filter((unit) => {
    const text = results.get(unit.id);
    return text !== undefined && isUntranslated(text, session.source.current, session.targetLang);
  });
  if (!candidates.length || session.budget.exhausted) return;
  session.log(() => `retry script cues=${unitsCues(candidates)}`);
  const recovered = await retryUnitsIndividually(session, candidates, acceptsRetriedUnit);
  const changed: Unit[] = [];
  for (const unit of candidates) {
    const text = recovered.get(unit.id);
    if (text !== undefined && text !== results.get(unit.id)) {
      changed.push(unit);
      results.set(unit.id, text);
    }
  }
  session.log(() => `retry script fixed=${unitsCues(changed) || "none"} unresolved=${unitsCues(candidates.filter((unit) => !changed.includes(unit))) || "none"}`);
}

function repairUnitMarkers(session: EngineSession, results: UnitTranslations, unitId: number): void {
  const text = results.get(unitId);
  const expected = expectedCueIds(session.unitById.get(unitId)!);
  if (text !== undefined && expected.length) results.set(unitId, repairCorruptMarkers(text, "c", expected));
}

function collectSuspects(session: EngineSession, results: UnitTranslations, pending: Unit[], initialMissing: Set<number>): number[] {
  const suspects = new Set(initialMissing);
  for (const unit of pending) {
    const text = results.get(unit.id);
    if (text === undefined) continue;
    const lengthSuspect = hasContent(unit.text) && (!hasContent(text) || !isLengthPlausible(unit.text, text));
    const cueSuspect = missingCueIds(unit, text).length > 0 || hasCorruptMarker(text) || hasMarkerLeak(unit.text, text);
    if (lengthSuspect || cueSuspect) suspects.add(unit.id);
  }

  const order = session.units;
  const position = new Map(order.map((unit, i) => [unit.id, i]));
  const withNeighbors = new Set(suspects);
  for (const id of suspects) {
    const at = position.get(id)!;
    for (const neighbor of [order[at - 1], order[at + 1]]) if (neighbor && neighbor.resolved === null) withNeighbors.add(neighbor.id);
  }
  return [...withNeighbors].sort((a, b) => a - b);
}

function fillTrivialCues(session: EngineSession, results: UnitTranslations, unit: Unit, missing: string[]): string[] {
  const { textById, termsById } = session.cueIndex;
  const trivial = missing.filter((id) => !hasTranslatableContent(textById.get(id) ?? "", termsById.get(id) ?? []));
  if (!trivial.length) return missing;
  const filled = new Map(trivial.map((id) => [id, applyTermReplacements(textById.get(id) ?? "", textById.get(id) ?? "", termsById.get(id) ?? [], session.targetRules.collapsesTermWhitespace)]));
  results.set(unit.id, patchMissingCues(results.get(unit.id) ?? "", expectedCueIds(unit), filled, session.dialect.spacedCueJoin));
  session.log(() => `fill glossary-only cues=${markerIds(trivial)}`);
  return missing.filter((id) => !trivial.includes(id));
}

async function retrySuspects(session: EngineSession, results: UnitTranslations, pending: Unit[], initialMissing: Set<number>): Promise<void> {
  if (session.budget.exhausted) return;
  const suspects = collectSuspects(session, results, pending, initialMissing);
  if (!suspects.length) return;

  session.log(() => `retry window cues=${unitsCues(suspects.map((id) => session.unitById.get(id)!))}`);
  for (const [id, text] of await retryWithWindows(session, suspects)) results.set(id, text);

  const missingByUnit = new Map<number, string[]>();
  const unresolvedAfterWindow: string[] = [];
  for (const id of suspects) {
    const unit = session.unitById.get(id)!;
    repairUnitMarkers(session, results, id);
    const missing = missingCueIds(unit, results.get(id));
    if (!missing.length) continue;
    unresolvedAfterWindow.push(...missing);
    const remaining = fillTrivialCues(session, results, unit, missing);
    if (remaining.length) missingByUnit.set(id, remaining);
  }
  session.log(() => `retry window unresolved=${markerIds(unresolvedAfterWindow) || "none"}`);
  if (!missingByUnit.size) return;

  session.log(() => `retry isolated cues=${markerIds([...missingByUnit.values()].flat())}`);
  const recoveredByUnit = await retryIsolatedCues(session, missingByUnit);
  session.log(() => describeOutcome("isolated", missingByUnit, recoveredByUnit));
  for (const [id, wanted] of missingByUnit) {
    const recovered = new Map([...(recoveredByUnit.get(id) ?? [])].filter(([cueId]) => wanted.includes(cueId)));
    if (!recovered.size) continue;
    results.set(id, patchMissingCues(results.get(id) ?? "", expectedCueIds(session.unitById.get(id)!), recovered, session.dialect.spacedCueJoin));
  }
}

async function retryLeaks(session: EngineSession, results: UnitTranslations, pending: Unit[]): Promise<void> {
  if (session.budget.exhausted) return;
  const { source, targetLang } = session;
  const leakByUnit = new Map<number, string[]>();
  for (const unit of pending) {
    const text = results.get(unit.id);
    const leaked = text === undefined ? [] : findLeakedCueIds(unit, text, source.current, targetLang);
    if (leaked.length) leakByUnit.set(unit.id, leaked);
  }
  if (!leakByUnit.size) return;

  session.log(() => `retry leak cues=${markerIds([...leakByUnit.values()].flat())}`);
  const recoveredByUnit = await retryIsolatedCues(session, leakByUnit, (original, candidate) => !isLeakedUntranslated(original, candidate, source.current, targetLang));
  session.log(() => describeOutcome("leak", leakByUnit, recoveredByUnit));
  for (const [id, recovered] of recoveredByUnit) {
    const unit = session.unitById.get(id)!;
    results.set(id, singleCueId(unit) !== null ? recovered.values().next().value! : patchMissingCues(results.get(id) ?? "", expectedCueIds(unit), recovered, session.dialect.spacedCueJoin));
  }
}

export function polishTranslations(session: EngineSession, results: UnitTranslations): UnitTranslations {
  const polished: UnitTranslations = new Map();
  for (const [id, text] of results) {
    const unit = session.unitById.get(id)!;
    const clean = session.dialect.polish(text);
    if (hasStyleTag(text) && !hasStyleTag(clean)) {
      session.log(() => `strip style tags cues=${unitCues(unit)}`);
    }
    polished.set(id, clean);
  }
  return polished;
}

export async function recoverTranslations(session: EngineSession, initial: UnitTranslations): Promise<UnitTranslations> {
  const results: UnitTranslations = new Map(initial);
  const pending = session.units.filter((unit) => unit.resolved === null);
  for (const unit of session.units) if (unit.resolved !== null) results.set(unit.id, unit.resolved);

  const initialMissing = new Set(pending.filter((unit) => !results.has(unit.id)).map((unit) => unit.id));
  if (initialMissing.size && !session.budget.exhausted) {
    session.log(() => `retry missing cues=${unitsCues([...initialMissing].map((id) => session.unitById.get(id)!))}`);
    const recovered = await retryUnitsIndividually(session, pending.filter((unit) => initialMissing.has(unit.id)), acceptsRecoveredUnit);
    for (const [id, text] of recovered) results.set(id, text);
    session.log(() => `retry missing fixed=${unitsCues([...recovered.keys()].map((id) => session.unitById.get(id)!)) || "none"} unresolved=${unitsCues([...initialMissing].filter((id) => !recovered.has(id)).map((id) => session.unitById.get(id)!)) || "none"}`);
  }

  await retryUntranslated(session, results, pending);
  for (const unit of pending) repairUnitMarkers(session, results, unit.id);
  await retrySuspects(session, results, pending, initialMissing);
  await retryLeaks(session, results, pending);
  await repairLatinWordLeaks(session, results);
  return polishTranslations(session, results);
}
