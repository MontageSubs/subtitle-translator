import { ProviderTranslateOptions, ProviderResultChunk } from "../../types";
import { Cue, Unit, Chapter } from "../../../core/types";
import { merge } from "../../../core/bilingualMerge";
import { coreLog } from "../../../core/log";
import { Transport } from "./types";
import { translateUnits, resolveContext } from "./index";

export async function* runHtmlMarkerProvider(
  transport: Transport, providerName: string, units: Unit[], chapters: Chapter[], cues: Cue[], options: ProviderTranslateOptions
): AsyncGenerator<ProviderResultChunk, void, unknown> {
  const { sourceLang, targetLang, contextText, contextNeedsTranslation, maxChars, startedAt, clientUserAgent } = options;
  const log = (msg: string) => {
    options.onLog?.(msg);
    coreLog("translate", msg);
  };

  const resolvedCtx = await resolveContext(
    transport, contextText, contextNeedsTranslation, sourceLang, targetLang, cues, maxChars, startedAt, clientUserAgent, log
  );

  const queue: Map<string, string>[] = [];
  let resolveQueue: (() => void) | null = null;
  let isDone = false;
  const cumulativeTranslations: Record<string, string> = {};
  const emittedCueIds = new Set<number>();

  const onChunk = (chunkTranslations: Map<string, string>) => {
    queue.push(chunkTranslations);
    if (resolveQueue) {
      resolveQueue();
      resolveQueue = null;
    }
  };

  const promise = translateUnits(
    transport, units, chapters, cues, resolvedCtx.sourceLang, targetLang,
    { maxChars, startedAt, clientUserAgent, onLog: log, contextText: resolvedCtx.contextText, onChunk }
  ).finally(() => {
    isDone = true;
    if (resolveQueue) resolveQueue();
  });

  while (!isDone || queue.length > 0) {
    if (queue.length > 0) {
      const chunk = queue.shift()!;
      for (const [k, v] of chunk) cumulativeTranslations[k] = v;

      const merged = await merge(cues, units, cumulativeTranslations, resolvedCtx.sourceLang, targetLang);

      const deltaCues = merged.cues.filter((c) => c.translation !== null && !emittedCueIds.has(c.id));
      if (deltaCues.length > 0) {
        for (const c of deltaCues) emittedCueIds.add(c.id);
        yield {
          cues: deltaCues,
          approx_splits: merged.approx_splits,
          missing_count: merged.missing_count,
          missing_cues: merged.missing_cues,
          quality_warnings: merged.quality_warnings,
          resolvedSourceLang: resolvedCtx.sourceLang,
          provider: providerName,
        };
      }
    } else {
      await new Promise<void>((resolve) => { resolveQueue = resolve; });
    }
  }

  const finalResult = await promise;
  const finalMerged = await merge(cues, units, finalResult.translations, resolvedCtx.sourceLang, targetLang, log);
  const finalDeltaCues = finalMerged.cues.filter((c) => c.translation !== null && !emittedCueIds.has(c.id));
  for (const c of finalDeltaCues) emittedCueIds.add(c.id);

  yield {
    cues: finalDeltaCues,
    approx_splits: finalMerged.approx_splits,
    missing_count: finalMerged.missing_count,
    missing_cues: finalMerged.missing_cues,
    quality_warnings: finalMerged.quality_warnings,
    resolvedSourceLang: finalResult.resolvedSourceLang,
    provider: providerName,
  };
}
