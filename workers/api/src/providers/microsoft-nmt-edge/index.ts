import { ProviderResultChunk, ProviderTranslateOptions, TranslationProvider } from "../types";
import { Chapter, Cue, Unit } from "../../core/types";
import { normalizeMicrosoftLang } from "./langCodes";
import { resolveEdgeUserAgent, callMicrosoftApi } from "./transport";
import {
  buildProtectedHtml,
  restoreFormattingTags,
  GROUP_MARKER_TEMPLATE,
  GROUP_MARKER_PATTERN,
  UNIT_MARKER_TEMPLATE,
  UNIT_MARKER_PATTERN,
  parseTranslatedHtml,
} from "./markerEngine";
import { merge } from "../../core/bilingualMerge";

function calculateBatchChars(configuredBatchChars: number = 8000): number {
  if (configuredBatchChars < 500) return configuredBatchChars;
  return Math.max(500, Math.floor(configuredBatchChars / 2));
}

function contentLength(text: string): number {
  const matches = (text || "").match(/\w/gu);
  return matches ? matches.length : 0;
}

function isLengthPlausible(sourceText: string, translatedText: string): boolean {
  const sourceLen = contentLength(sourceText);
  if (sourceLen === 0) return true;
  const ratio = contentLength(translatedText) / sourceLen;
  return ratio >= 0.15 && ratio <= 6.0;
}

export class MicrosoftNmtEdgeProvider implements TranslationProvider {
  async *translate(
    units: Unit[],
    chapters: Chapter[],
    cues: Cue[],
    options: ProviderTranslateOptions
  ): AsyncGenerator<ProviderResultChunk, void, unknown> {
    const batchChars = calculateBatchChars(options.maxChars);
    const targetLang = normalizeMicrosoftLang(options.targetLang);
    let currentSourceLang = normalizeMicrosoftLang(options.sourceLang);
    const userAgent = resolveEdgeUserAgent(options.clientUserAgent);
    const glossary = options.glossary || {};
    const caseSensitive = options.caseSensitiveTerms || false;
    const log = options.onLog || (() => {});

    const pendingUnits = units.filter(u => u.resolved === undefined);
    const resolvedUnits = new Map(units.filter(u => u.resolved !== undefined).map(u => [u.id, u.resolved!]));

    let segments: Unit[][] = [];
    let currentSegment: Unit[] = [];
    let currentChars = 0;

    for (const unit of pendingUnits) {
      const chars = unit.text.length;
      if (chars > Math.max(batchChars, 100)) {
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
          currentSegment = [];
          currentChars = 0;
        }
        segments.push([unit]);
      } else if (currentChars + chars > batchChars) {
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
        }
        currentSegment = [unit];
        currentChars = chars;
      } else {
        currentSegment.push(unit);
        currentChars += chars;
      }
    }
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    log(`Microsoft Edge NMT: Translating ${pendingUnits.length} units in ${segments.length} segments with batch size ${batchChars}`);

    const queue: Record<number, string>[] = [];
    let resolveQueue: (() => void) | null = null;
    let isDone = false;

    const cumulativeTranslations: Record<number, string> = {};
    for (const [k, v] of resolvedUnits) cumulativeTranslations[k] = v;

    const emittedCueIds = new Set<number>();

    const pushChunk = (chunk: Record<number, string>) => {
      queue.push(chunk);
      if (resolveQueue) {
        resolveQueue();
        resolveQueue = null;
      }
    };

    const processSegment = async (segment: Unit[], index: number) => {
      let payloadText = "";
      for (const unit of segment) {
        const html = buildProtectedHtml(unit.text, glossary, caseSensitive);
        payloadText += \`\${GROUP_MARKER_TEMPLATE(unit.id)}\${html}\`;
      }
      
      let chunkTranslations: Record<number, string> = {};
      let attempt = 0;
      let success = false;
      while (attempt < 3 && !success) {
        attempt++;
        try {
          const resp = await callMicrosoftApi([payloadText], currentSourceLang, targetLang, userAgent);
          if (resp && resp.length > 0) {
            if (currentSourceLang === "" && resp[0]?.detectedLanguage?.language) {
              currentSourceLang = normalizeMicrosoftLang(resp[0].detectedLanguage.language);
            }
            if (resp[0]?.translations && resp[0].translations.length > 0) {
              const translatedHtml = resp[0].translations[0]!.text;
              const extracted = parseTranslatedHtml(translatedHtml, GROUP_MARKER_PATTERN);
              
              for (const unit of segment) {
                if (extracted[unit.id]) {
                  let text = restoreFormattingTags(extracted[unit.id]!).trim();
                  if (isLengthPlausible(unit.text, text)) {
                    chunkTranslations[unit.id] = text;
                  }
                }
              }
              success = true;
            }
          }
        } catch (e: any) {
          log(\`Batch \${index + 1} attempt \${attempt} failed: \${e.message}\`);
          if (attempt === 3) break;
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }

      // Fallback for missing or implausible units
      for (const unit of segment) {
        if (!chunkTranslations[unit.id]) {
          const html = buildProtectedHtml(unit.text, glossary, caseSensitive);
          const fallbackPayload = \`\${UNIT_MARKER_TEMPLATE(unit.id)}\${html}\`;
          try {
            const resp = await callMicrosoftApi([fallbackPayload], currentSourceLang, targetLang, userAgent);
            if (resp && resp.length > 0 && resp[0]?.translations) {
              const translatedHtml = resp[0].translations[0]!.text;
              const extracted = parseTranslatedHtml(translatedHtml, UNIT_MARKER_PATTERN);
              if (extracted[unit.id]) {
                const text = restoreFormattingTags(extracted[unit.id]!).trim();
                chunkTranslations[unit.id] = text;
              }
            }
          } catch(e) {}
        }
      }

      pushChunk(chunkTranslations);
    };

    // Highly concurrent execution
    const promise = (async () => {
      const concurrency = 16;
      let active = 0;
      let currentIndex = 0;
      const workers: Promise<void>[] = [];

      const spawn = async () => {
        while (currentIndex < segments.length) {
          const index = currentIndex++;
          const segment = segments[index]!;
          active++;
          await processSegment(segment, index);
          active--;
        }
      };

      for (let i = 0; i < concurrency; i++) {
        workers.push(spawn());
      }
      await Promise.all(workers);
    })().finally(() => {
      isDone = true;
      if (resolveQueue) resolveQueue();
    });

    while (!isDone || queue.length > 0) {
      if (queue.length > 0) {
        const chunk = queue.shift()!;
        for (const [k, v] of Object.entries(chunk)) {
          cumulativeTranslations[parseInt(k)] = v;
        }

        const merged = await merge(cues, units, cumulativeTranslations, currentSourceLang, targetLang);
        const deltaCues = merged.cues.filter((c) => c.translation !== null && !emittedCueIds.has(c.id));
        
        if (deltaCues.length > 0) {
          for (const c of deltaCues) emittedCueIds.add(c.id);
          yield {
            cues: deltaCues,
            approx_splits: merged.approx_splits,
            missing_count: merged.missing_count,
            missing_cues: merged.missing_cues,
            quality_warnings: merged.quality_warnings,
            resolvedSourceLang: currentSourceLang,
            provider: "microsoft-nmt-edge",
          };
        }
      } else {
        await new Promise<void>((resolve) => { resolveQueue = resolve; });
      }
    }

    const finalResult = await promise; // ensure caught
    const finalMerged = await merge(cues, units, cumulativeTranslations, currentSourceLang, targetLang, log);
    const finalDeltaCues = finalMerged.cues.filter((c) => c.translation !== null && !emittedCueIds.has(c.id));
    for (const c of finalDeltaCues) emittedCueIds.add(c.id);

    yield {
      cues: finalDeltaCues,
      approx_splits: finalMerged.approx_splits,
      missing_count: finalMerged.missing_count,
      missing_cues: finalMerged.missing_cues,
      quality_warnings: finalMerged.quality_warnings,
      resolvedSourceLang: currentSourceLang,
      provider: "microsoft-nmt-edge",
    };
  }
}
