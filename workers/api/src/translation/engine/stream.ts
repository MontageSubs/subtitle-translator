import { BilingualMerger } from "../../subtitle/merge";
import type { BilingualCue } from "../../subtitle/types";
import type { TranslationChunk } from "../types";
import type { EngineInput, UnitTranslations } from "./input";
import { hasCorruptMarker, hasMarkerLeak } from "./markerRepair";
import { isLengthPlausible } from "./text";
import { isUntranslated } from "./untranslated";

const YIELD_INTERVAL_MS = 300;

export interface StreamSession {
  readonly source: { readonly current: string };
  readonly targetLang: string;
  readonly log: (message: string) => void;
}

export type Publisher = (chunk: UnitTranslations) => void;
export type Execution = (publish: Publisher) => Promise<UnitTranslations>;

function isPresentable(session: StreamSession, cue: BilingualCue): boolean {
  const translation = cue.translation!;
  return (
    !isUntranslated(translation, session.source.current, session.targetLang) &&
    !hasMarkerLeak(cue.text, translation) &&
    !hasCorruptMarker(translation) &&
    isLengthPlausible(cue.text, translation)
  );
}

export async function* streamTranslations(
  session: StreamSession, input: EngineInput, providerId: string, execute: Execution
): AsyncGenerator<TranslationChunk, void, unknown> {
  const merger = await BilingualMerger.create(input.cues, input.units, session.source.current, session.targetLang);
  merger.ingest(input.units.flatMap((unit) => (unit.resolved === null ? [] : [[unit.id, unit.resolved] as const])));

  const queue: UnitTranslations[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  const notify = () => {
    wake?.();
    wake = null;
  };

  const execution = execute((chunk) => {
    queue.push(chunk);
    notify();
  }).finally(() => {
    finished = true;
    notify();
  });
  execution.catch(() => undefined);

  const emitted = new Map<number, string>();
  let lastYield = Date.now();

  while (!finished || queue.length) {
    if (!queue.length) {
      await new Promise<void>((resolve) => (wake = resolve));
      continue;
    }
    while (queue.length) merger.ingest(queue.shift()!);
    merger.setSourceLang(session.source.current);

    if (Date.now() - lastYield < YIELD_INTERVAL_MS) continue;
    lastYield = Date.now();
    const cues = merger.takeUpdatedCues().filter((cue) => emitted.get(cue.id) !== cue.translation && isPresentable(session, cue));
    if (!cues.length) continue;
    for (const cue of cues) emitted.set(cue.id, cue.translation!);
    yield { cues, resolvedSourceLang: session.source.current, provider: providerId };
  }

  merger.ingest(await execution);
  merger.setSourceLang(session.source.current);
  const summary = merger.snapshot(session.log);
  const cues = summary.cues.filter((cue) => cue.translation !== null && emitted.get(cue.id) !== cue.translation);
  yield {
    cues,
    resolvedSourceLang: session.source.current,
    provider: providerId,
    summary: {
      approx_splits: summary.approx_splits,
      missing_count: summary.missing_count,
      missing_cues: summary.missing_cues,
      quality_warnings: summary.quality_warnings,
    },
  };
}
