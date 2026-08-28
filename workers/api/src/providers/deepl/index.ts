import { TranslationProvider, ProviderTranslateOptions, ProviderResultChunk } from "../types";
import { Cue, Unit, Chapter } from "../../core/types";
import { merge } from "../../core/bilingualMerge";
import { coreLog } from "../../core/log";
import { remainingBudgetMs } from '../../config/env';
import { resolveDeeplConfig, deeplTranslate, createDeeplGlossary, deleteDeeplGlossary } from "./api";
import { toDeeplLang } from "./langCodes";

const MAX_TEXTS_PER_BATCH = 50;
const MAX_CONTEXT_CHARS = 500;

function batchUnits(units: Unit[], maxChars: number): Unit[][] {
  const batches: Unit[][] = [];
  let current: Unit[] = [];
  let currentChars = 0;
  for (const unit of units) {
    if (current.length && (current.length >= MAX_TEXTS_PER_BATCH || currentChars + unit.text.length > maxChars)) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(unit);
    currentChars += unit.text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

export class DeepLProvider implements TranslationProvider {
  async *translate(
    units: Unit[], chapters: Chapter[], cues: Cue[], options: ProviderTranslateOptions
  ): AsyncGenerator<ProviderResultChunk, void, unknown> {
    const { env, sourceLang, targetLang, glossary, contextText, contextNeedsTranslation, maxChars, startedAt } = options;
    const log = (message: string) => coreLog("deepl", message);
    if (!env.DEEPL_API_KEY) throw new Error("DEEPL_API_KEY is required for deepl provider");
    const config = resolveDeeplConfig(env.DEEPL_API_KEY);
    const deeplTarget = toDeeplLang(targetLang, "target");

    const pending = units.filter((u) => u.resolved === null);
    const translations: Record<string, string> = {};
    for (const unit of units) if (unit.resolved !== null) translations[String(unit.id)] = unit.resolved as string;

    const hasGlossaryTerms = Object.keys(glossary).length > 0;
    let resolvedSourceLang = sourceLang;

    if (resolvedSourceLang === "auto" && hasGlossaryTerms && pending.length) {
      log("source language unknown, probing to resolve it before creating a glossary");
      try {
        const [probe] = await deeplTranslate(
          config, [pending[0].text.slice(0, 200)], undefined, deeplTarget, undefined, undefined, AbortSignal.timeout(remainingBudgetMs(startedAt))
        );
        if (probe?.detectedSourceLanguage) resolvedSourceLang = probe.detectedSourceLanguage.toLowerCase();
      } catch (e) {
        log("source-language probe failed, glossary will be skipped for this job");
      }
    }

    let resolvedContext = contextText;
    if (resolvedContext && contextNeedsTranslation && resolvedSourceLang !== "auto") {
      log(`translating supplied context into ${resolvedSourceLang} to match the subtitle`);
      try {
        const [translated] = await deeplTranslate(
          config, [resolvedContext], undefined, toDeeplLang(resolvedSourceLang, "target"), undefined, undefined, AbortSignal.timeout(remainingBudgetMs(startedAt))
        );
        resolvedContext = translated?.text || resolvedContext;
      } catch (e) {
        log("context translation failed, using the original text as-is");
      }
    }
    if (resolvedContext && resolvedContext.length > Math.min(MAX_CONTEXT_CHARS, maxChars)) {
      resolvedContext = resolvedContext.slice(0, Math.min(MAX_CONTEXT_CHARS, maxChars));
    }

    const deeplSource = resolvedSourceLang !== "auto" ? toDeeplLang(resolvedSourceLang, "source") : undefined;
    let glossaryId: string | null = null;
    if (hasGlossaryTerms && deeplSource) {
      const deeplGlossaryTarget = toDeeplLang(targetLang, "glossary");
      glossaryId = await createDeeplGlossary(config, deeplSource, deeplGlossaryTarget, glossary);
      if (!glossaryId) log("glossary creation failed, proceeding without term locking for this job");
    } else if (hasGlossaryTerms) {
      log("source language could not be resolved, proceeding without term locking for this job");
    }

    const emitted = new Set<number>();
    for (const batch of batchUnits(pending, maxChars)) {
      try {
        const results = await deeplTranslate(
          config, batch.map((u) => u.text), deeplSource, deeplTarget, resolvedContext, glossaryId || undefined,
          AbortSignal.timeout(remainingBudgetMs(startedAt))
        );
        batch.forEach((unit, i) => { translations[String(unit.id)] = results[i]?.text ?? ""; });
      } catch (e) {
        log(`batch of ${batch.length} unit(s) failed, will be retried individually`);
        for (const unit of batch) {
          try {
            const [single] = await deeplTranslate(
              config, [unit.text], deeplSource, deeplTarget, resolvedContext, glossaryId || undefined,
              AbortSignal.timeout(remainingBudgetMs(startedAt))
            );
            if (single) translations[String(unit.id)] = single.text;
          } catch (retryError) {
            log(`unit ${unit.id} failed on retry, skipping`);
          }
        }
      }

      const merged = await merge(cues, units, translations, resolvedSourceLang, targetLang);
      const delta = merged.cues.filter((c) => c.translation !== null && !emitted.has(c.id));
      if (delta.length) {
        for (const c of delta) emitted.add(c.id);
        yield { cues: delta, approx_splits: [], missing_count: 0, missing_cues: [], quality_warnings: [], resolvedSourceLang, provider: "deepl" };
      }
    }

    if (glossaryId) await deleteDeeplGlossary(config, glossaryId);

    const finalMerged = await merge(cues, units, translations, resolvedSourceLang, targetLang, log);
    const finalDelta = finalMerged.cues.filter((c) => c.translation !== null && !emitted.has(c.id));
    yield {
      cues: finalDelta,
      approx_splits: finalMerged.approx_splits,
      missing_count: finalMerged.missing_count,
      missing_cues: finalMerged.missing_cues,
      quality_warnings: finalMerged.quality_warnings,
      resolvedSourceLang,
      provider: "deepl",
    };
  }
}
