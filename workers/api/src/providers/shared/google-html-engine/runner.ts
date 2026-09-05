import { ProviderTranslateOptions, ProviderResultChunk } from "../../types";
import { Cue, Unit, Chapter } from "../../../core/types";
import { BilingualMerger } from "../../../core/bilingualMerge";
import { Transport } from "./types";
import { translateUnits, resolveContext, isUntranslated, isLengthPlausible } from "./index";
import { hasMarkerLeak, CORRUPT_MARKER_SIGNATURE } from "../markerRepair";
import { withSubrequestBudget } from "../subrequestGuard";

const SUBREQUEST_LIMIT = 35;

export async function* runHtmlMarkerProvider(
  rawTransport: Transport, providerName: string, units: Unit[], chapters: Chapter[], cues: Cue[], options: ProviderTranslateOptions
): AsyncGenerator<ProviderResultChunk, void, unknown> {
  const { sourceLang, targetLang, contextText, contextNeedsTranslation, maxChars, startedAt, clientUserAgent } = options;
  const log = (msg: string) => {
    options.onLog?.(msg);
  };

  let breakerTripped = false;
  const transport: Transport = {
    get isExhausted() { return breakerTripped; },
    send: withSubrequestBudget(rawTransport.send.bind(rawTransport), SUBREQUEST_LIMIT, () => {
      if (!breakerTripped) {
        breakerTripped = true;
        log("Subrequest physical breaker triggered, gracefully terminating to protect worker invocation limit.");
      }
    }),
  };

  const resolvedCtx = await resolveContext(
    transport, contextText, contextNeedsTranslation, sourceLang, targetLang, cues, maxChars, startedAt, clientUserAgent, log
  );

  const queue: Map<string, string>[] = [];
  let resolveQueue: (() => void) | null = null;
  let isDone = false;
  const cumulativeTranslations: Record<string, string> = {};
  const emittedCueTexts = new Map<number, string>();
  const merger = await BilingualMerger.create(cues, units, resolvedCtx.sourceLang, targetLang);

  const onChunk = (chunkTranslations: Map<string, string>) => {
    queue.push(chunkTranslations);
    if (resolveQueue) {
      resolveQueue();
      resolveQueue = null;
    }
  };

  const promise = translateUnits(
    transport, units, chapters, cues, resolvedCtx.sourceLang, targetLang,
    { maxChars, startedAt, clientUserAgent, onLog: log, contextText: resolvedCtx.contextText, onChunk, subrequestLimit: SUBREQUEST_LIMIT }
  ).finally(() => {
    isDone = true;
    if (resolveQueue) resolveQueue();
  });

  let lastYieldTime = Date.now();
  while (!isDone || queue.length > 0) {
    if (queue.length > 0) {
      while (queue.length > 0) {
        const chunk = queue.shift()!;
        for (const [k, v] of chunk) cumulativeTranslations[k] = v;
      }

      merger.ingest(cumulativeTranslations);
      
      const now = Date.now();
      if (now - lastYieldTime >= 300 || (isDone && queue.length === 0)) {
        lastYieldTime = now;
        const merged = merger.snapshot();

        const deltaCues = merged.cues.filter((c) => {
          if (c.translation === null) return false;
          if (emittedCueTexts.get(c.id) === c.translation) return false;
          
          if (isUntranslated(c.translation, resolvedCtx.sourceLang, targetLang)) return false;
          if (hasMarkerLeak(c.text, c.translation)) return false;
          if (CORRUPT_MARKER_SIGNATURE.test(c.translation)) return false;
          if (!isLengthPlausible(c.text, c.translation)) return false;
          
          return true;
        });
        if (deltaCues.length > 0) {
          for (const c of deltaCues) emittedCueTexts.set(c.id, c.translation!);
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
      }
    } else {
      await new Promise<void>((resolve) => { resolveQueue = resolve; });
    }
  }

  const finalResult = await promise;
  merger.ingest(finalResult.translations);
  const finalMerged = merger.snapshot(log);
  const finalDeltaCues = finalMerged.cues.filter((c) => {
    if (c.translation === null) return false;
    if (emittedCueTexts.get(c.id) === c.translation) return false;
    if (hasMarkerLeak(c.text, c.translation)) return false;
    if (CORRUPT_MARKER_SIGNATURE.test(c.translation)) return false;
    if (!isLengthPlausible(c.text, c.translation)) return false;
    return true;
  });
  for (const c of finalDeltaCues) emittedCueTexts.set(c.id, c.translation!);

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
