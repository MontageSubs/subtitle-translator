import type { EngineInput, ProviderJob, TranslationChunk } from "../types";
import type { Adapter } from "./adapter";
import { resolveContext } from "./context";
import { recoverTranslations } from "./recovery/recovery";
import { createSession } from "./session";
import { streamTranslations } from "./stream";

export interface RunOptions {
  requestChars: number;
}

export async function* runEngine(
  adapter: Adapter, input: EngineInput, job: ProviderJob, options: RunOptions
): AsyncGenerator<TranslationChunk, void, unknown> {
  const session = createSession(adapter.dialect, input, job, options.requestChars);
  const context = await resolveContext(session, input.cues);
  yield* streamTranslations(session, input, adapter.dialect.id, async (publish) => {
    const pending = input.units.filter((unit) => unit.resolved === null);
    const initial = pending.length ? await adapter.initialPass(session, pending, context, publish) : new Map();
    return recoverTranslations(session, initial);
  });
}
