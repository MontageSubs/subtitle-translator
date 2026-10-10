import { hasTranslatableContent, isLeakedUntranslated } from "../../lib/subtitle/common/untranslated";
import type { TranslateJobPayload, TranslateJobResponse } from "./types";

type Cue = TranslateJobPayload["cues"][number];

export interface JobAccumulator {
  absorb(round: Partial<TranslateJobResponse>): void;
  isOutstanding(cue: Pick<Cue, "id" | "text">): boolean;
  outstandingCues(): Cue[];
  hasAnyResult(): boolean;
  translatedCount(): number;
  retryToken(): string | undefined;
  displayProgress(partial: Partial<TranslateJobResponse>): TranslateJobResponse;
  finalize(): TranslateJobResponse;
}

const hasText = (value: string | null | undefined): value is string => Boolean(value && value.trim() !== "");

export function createJobAccumulator(job: TranslateJobPayload): JobAccumulator {
  const translated = new Map<number, string>();
  const music = new Map<number, boolean>();
  const leaked = new Map<number, string>();
  const display = new Map<number, string>();
  const approxSplits: TranslateJobResponse["approx_splits"] = [];
  const qualityWarnings: TranslateJobResponse["quality_warnings"] = [];
  let sourceLang = "";
  let provider: string | undefined;
  let retryToken: string | undefined;

  const isOutstanding = (cue: Pick<Cue, "id" | "text">) => hasTranslatableContent(cue.text) && !translated.get(cue.id)?.trim();

  return {
    absorb(round) {
      sourceLang ||= round.resolved_source_lang || "";
      const detectionLang = sourceLang || job.source;
      for (const cue of round.cues ?? []) {
        if (cue.is_music !== undefined) music.set(cue.id, cue.is_music);
        if (!hasText(cue.translation)) {
          translated.delete(cue.id);
        } else if (isLeakedUntranslated(cue.text, cue.translation, detectionLang, job.target)) {
          leaked.set(cue.id, cue.translation);
          translated.delete(cue.id);
        } else {
          translated.set(cue.id, cue.translation);
          leaked.delete(cue.id);
        }
      }
      if (round.approx_splits?.length) approxSplits.push(...round.approx_splits);
      if (round.quality_warnings?.length) qualityWarnings.push(...round.quality_warnings);
      if (round.provider) provider = round.provider;
      retryToken = round.retry_token;
      translated.forEach((translation, id) => display.set(id, translation));
    },

    isOutstanding,
    outstandingCues: () => job.cues.filter(isOutstanding),
    hasAnyResult: () => translated.size > 0 || leaked.size > 0,
    translatedCount: () => translated.size,
    retryToken: () => retryToken,

    displayProgress(partial) {
      for (const cue of partial.cues ?? []) if (hasText(cue.translation)) display.set(cue.id, cue.translation);
      return { ...(partial as TranslateJobResponse), cues: job.cues.map((cue) => ({ ...cue, translation: display.get(cue.id) ?? null })) };
    },

    finalize() {
      const missing: Cue[] = [];
      for (const cue of job.cues.filter(isOutstanding)) {
        const leakedTranslation = leaked.get(cue.id);
        if (leakedTranslation) {
          translated.set(cue.id, leakedTranslation);
          qualityWarnings.push({ cue_id: cue.id, cps: 0, over_cps: false, over_length: false, leaked: true });
        } else {
          missing.push(cue);
        }
      }
      return {
        success: translated.size > 0,
        resolved_source_lang: sourceLang || job.source,
        provider,
        cues: job.cues.map((cue) => ({ ...cue, translation: translated.get(cue.id) || (hasTranslatableContent(cue.text) ? null : cue.text), is_music: music.get(cue.id) })),
        approx_splits: approxSplits,
        missing_count: missing.length,
        missing_cues: missing.map((cue) => cue.id),
        quality_warnings: qualityWarnings,
        retry_token: retryToken,
      };
    },
  };
}
