import type { EngineInput, ProviderJob, TranslationChunk } from "../types";
import type { Adapter } from "./adapter";
import { resolveContext } from "./context";
import { recoverTranslations } from "./recovery/recovery";
import { createSession, isSourceSameAsTarget } from "./session";
import { streamTranslations } from "./stream";

export interface RunOptions {
  requestChars: number;
}

export async function* runEngine(
  adapter: Adapter, input: EngineInput, job: ProviderJob, options: RunOptions
): AsyncGenerator<TranslationChunk, void, unknown> {
  const session = createSession(adapter.dialect, input, job, options.requestChars);
  if (session.signal?.aborted) return;
  const context = await resolveContext(session, input.cues);
  if (session.signal?.aborted) return;
  yield* streamTranslations(session, input, adapter.dialect.id, async (publish) => {
    const pending = input.units.filter((unit) => unit.resolved === null);
    const initial = pending.length ? await adapter.initialPass(session, pending, context, publish) : new Map();
    if (session.signal?.aborted) return initial;
    if (isSourceSameAsTarget(session)) return new Map(input.units.map((unit) => [unit.id, unit.resolved ?? unit.text] as const));
    return recoverTranslations(session, initial);
  });
}
