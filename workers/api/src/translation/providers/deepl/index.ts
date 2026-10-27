import type { Unit } from "../../../subtitle/types";
import { cuesOf, failureCode } from "../../engine/cueIds";
import { deadlineSignal } from "../../engine/concurrency";
import type { ProviderJob, TranslationProvider, UnitTranslations } from "../../types";
import { SourceLangTracker } from "../../engine/session";
import { streamTranslations } from "../../engine/stream";
import { createDeeplGlossary, deeplTranslate, deleteDeeplGlossary, resolveDeeplConfig, type DeeplConfig } from "./api";
import { MAX_CONTEXT_CHARS, truncateContext } from "../../contextText";
import { toDeeplLang } from "./languages";
import { escapeHtml, unescapeHtml } from "../../engine/text";
import type { TermJob, TermTransport } from "../../terms/types";

const PROVIDER_ID = "deepl";
const AUTO_LANG = "auto";
const MAX_TEXTS_PER_BATCH = 50;
const PROBE_SAMPLE_CHARS = 200;

function batchUnits(units: Unit[], maxChars: number): Unit[][] {
  const batches: Unit[][] = [];
  let current: Unit[] = [];
  let chars = 0;
  for (const unit of units) {
    if (current.length && (current.length >= MAX_TEXTS_PER_BATCH || chars + unit.text.length > maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(unit);
    chars += unit.text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function probeSourceLanguage(config: DeeplConfig, sample: string, target: string, job: ProviderJob): Promise<string | null> {
  try {
    const [probe] = await deeplTranslate(config, { texts: [sample.slice(0, PROBE_SAMPLE_CHARS)], target, signal: deadlineSignal(job.startedAt) });
    return probe?.detectedSourceLanguage?.toLowerCase() ?? null;
  } catch {
    job.trace?.fail("glossary", "probe_failed");
    return null;
  }
}

async function resolveContext(config: DeeplConfig, source: string, job: ProviderJob): Promise<string | undefined> {
  let context = job.contextText;
  if (context && job.contextNeedsTranslation && source !== AUTO_LANG) {
    try {
      const [translated] = await deeplTranslate(config, { texts: [context], target: toDeeplLang(source, "target"), signal: deadlineSignal(job.startedAt) });
      context = translated?.text || context;
    } catch (error) {
      job.trace?.fail("context", failureCode(error));
    }
  }
  return context && truncateContext(context, Math.min(MAX_CONTEXT_CHARS, job.maxChars));
}

function deeplTermTransport(job: TermJob): TermTransport {
  if (!job.env.DEEPL_API_KEY) throw new Error("DEEPL_API_KEY is required for deepl provider");
  const config = resolveDeeplConfig(job.env.DEEPL_API_KEY);
  const source = toDeeplLang(job.sourceLang, "source");
  const target = toDeeplLang(job.targetLang, "target");
  return {
    maxItems: MAX_TEXTS_PER_BATCH,
    splitsOnFailure: false,
    async send(texts, signal) {
      const results = await deeplTranslate(config, { texts: texts.map(escapeHtml), source, target, signal });
      return texts.map((_, index) => (results[index] ? unescapeHtml(results[index]!.text) : null));
    },
  };
}

export const deeplProvider: TranslationProvider = {
  id: PROVIDER_ID,
  requestChars: (maxChars) => maxChars,
  termTransport: deeplTermTransport,
  async *translate(input, job) {
    const { env, glossary, targetLang, trace } = job;
    if (!env.DEEPL_API_KEY) throw new Error("DEEPL_API_KEY is required for deepl provider");
    const config = resolveDeeplConfig(env.DEEPL_API_KEY);
    const target = toDeeplLang(targetLang, "target");
    const pending = input.units.filter((unit) => unit.resolved === null);
    const hasGlossary = Object.keys(glossary).length > 0;
    const source = new SourceLangTracker(job.sourceLang, AUTO_LANG, (code) => code);

    if (source.isAuto && hasGlossary && pending.length) {
      source.note(await probeSourceLanguage(config, pending[0]!.text, target, job));
    }

    const context = await resolveContext(config, source.current, job);
    const deeplSource = source.isAuto ? undefined : toDeeplLang(source.current, "source");
    let glossaryId: string | null = null;
    if (hasGlossary && deeplSource) {
      glossaryId = await createDeeplGlossary(config, deeplSource, toDeeplLang(targetLang, "glossary"), glossary);
      if (!glossaryId) trace?.fail("glossary", "create_failed");
    } else if (hasGlossary) {
      trace?.fail("glossary", "source_unresolved");
    }

    const request = (texts: string[]) => ({ texts, source: deeplSource, target, context, glossaryId: glossaryId || undefined, signal: deadlineSignal(job.startedAt, job.signal) });
    const session = { source, targetLang, trace, signal: job.signal };

    yield* streamTranslations(session, input, PROVIDER_ID, async (publish) => {
      const translations: UnitTranslations = new Map();
      try {
        const batches = batchUnits(pending, job.maxChars);
        trace?.emit({ e: "plan", provider: PROVIDER_ID, batches: batches.map((batch) => cuesOf(batch)) });
        for (const [index, batch] of batches.entries()) {
          if (job.signal?.aborted) break;
          const chunk: UnitTranslations = new Map();
          try {
            const results = await deeplTranslate(config, request(batch.map((unit) => unit.text)));
            batch.forEach((unit, i) => chunk.set(unit.id, results[i]?.text ?? ""));
          } catch (error) {
            if (job.signal?.aborted) break;
            trace?.fail("batch", failureCode(error), index + 1);
            for (const unit of batch) {
              if (job.signal?.aborted) break;
              try {
                const [single] = await deeplTranslate(config, request([unit.text]));
                if (single) chunk.set(unit.id, single.text);
              } catch {
                trace?.emit({ e: "skip", cues: cuesOf([unit]) });
              }
            }
          }
          if (job.signal?.aborted) break;
          for (const [id, text] of chunk) translations.set(id, text);
          if (trace && batch.some((unit) => !chunk.get(unit.id))) trace.batch(index + 1, batches.length, cuesOf(batch.filter((unit) => !chunk.get(unit.id))));
          publish(chunk);
        }
      } finally {
        if (glossaryId) await deleteDeeplGlossary(config, glossaryId).catch(() => undefined);
      }
      for (const unit of input.units) if (unit.resolved !== null) translations.set(unit.id, unit.resolved);
      return translations;
    });
  },
};
