import type { Unit } from "../../../subtitle/types";
import { logBatchOutcome } from "../../engine/batchLog";
import { countCues, failureLabel, unitCues, unitsCues } from "../../engine/cueLabels";
import { deadlineSignal } from "../../engine/concurrency";
import type { ProviderJob, TranslationProvider, UnitTranslations } from "../../types";
import { SourceLangTracker } from "../../engine/session";
import { streamTranslations } from "../../engine/stream";
import { createDeeplGlossary, deeplTranslate, deleteDeeplGlossary, resolveDeeplConfig, type DeeplConfig } from "./api";
import { MAX_CONTEXT_CHARS, truncateContext } from "../../contextText";
import { toDeeplLang } from "./languages";

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
    job.onLog("glossary probe failed action=skip");
    return null;
  }
}

async function resolveContext(config: DeeplConfig, source: string, job: ProviderJob): Promise<string | undefined> {
  let context = job.contextText;
  if (context && job.contextNeedsTranslation && source !== AUTO_LANG) {
    job.onLog(() => `context translate target=${source}`);
    try {
      const [translated] = await deeplTranslate(config, { texts: [context], target: toDeeplLang(source, "target"), signal: deadlineSignal(job.startedAt) });
      context = translated?.text || context;
    } catch {
      job.onLog("context translate failed fallback=original");
    }
  }
  return context && truncateContext(context, Math.min(MAX_CONTEXT_CHARS, job.maxChars));
}

export const deeplProvider: TranslationProvider = {
  id: PROVIDER_ID,
  async *translate(input, job) {
    const { env, glossary, targetLang, onLog } = job;
    if (!env.DEEPL_API_KEY) throw new Error("DEEPL_API_KEY is required for deepl provider");
    const config = resolveDeeplConfig(env.DEEPL_API_KEY);
    const target = toDeeplLang(targetLang, "target");
    const pending = input.units.filter((unit) => unit.resolved === null);
    const hasGlossary = Object.keys(glossary).length > 0;
    const source = new SourceLangTracker(job.sourceLang, AUTO_LANG, (code) => code);

    if (source.isAuto && hasGlossary && pending.length) {
      onLog("glossary probe source=unknown");
      source.note(await probeSourceLanguage(config, pending[0]!.text, target, job));
    }

    const context = await resolveContext(config, source.current, job);
    const deeplSource = source.isAuto ? undefined : toDeeplLang(source.current, "source");
    let glossaryId: string | null = null;
    if (hasGlossary && deeplSource) {
      glossaryId = await createDeeplGlossary(config, deeplSource, toDeeplLang(targetLang, "glossary"), glossary);
      if (!glossaryId) onLog("glossary create failed action=skip");
    } else if (hasGlossary) {
      onLog("glossary source unresolved action=skip");
    }

    const request = (texts: string[]) => ({ texts, source: deeplSource, target, context, glossaryId: glossaryId || undefined, signal: deadlineSignal(job.startedAt) });
    const session = { source, targetLang, log: onLog, punctuation: job.punctuation };

    yield* streamTranslations(session, input, PROVIDER_ID, async (publish) => {
      const translations: UnitTranslations = new Map();
      try {
        const batches = batchUnits(pending, job.maxChars);
        onLog(() => `dispatch provider=deepl cues=${countCues(pending)} batches=${batches.length}`);
        for (const [index, batch] of batches.entries()) {
          const chunk: UnitTranslations = new Map();
          try {
            const results = await deeplTranslate(config, request(batch.map((unit) => unit.text)));
            batch.forEach((unit, i) => chunk.set(unit.id, results[i]?.text ?? ""));
          } catch (error) {
            onLog(() => `dispatch batch failed cues=${unitsCues(batch)} error=${failureLabel(error)} action=retry-single`);
            for (const unit of batch) {
              try {
                const [single] = await deeplTranslate(config, request([unit.text]));
                if (single) chunk.set(unit.id, single.text);
              } catch {
                onLog(() => `dispatch retry failed skipped cues=${unitCues(unit)}`);
              }
            }
          }
          for (const [id, text] of chunk) translations.set(id, text);
          logBatchOutcome(onLog, { label: `${index + 1}/${batches.length}`, received: { has: (id) => Boolean(chunk.get(id)) }, units: () => batch });
          publish(chunk);
        }
      } finally {
        if (glossaryId) await deleteDeeplGlossary(config, glossaryId);
      }
      for (const unit of input.units) if (unit.resolved !== null) translations.set(unit.id, unit.resolved);
      return translations;
    });
  },
};
