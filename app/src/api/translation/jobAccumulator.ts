import { hasTranslatableContent } from "../../lib/subtitle/common/untranslated";
import { joinCueLines } from "../../lib/subtitle/extraction/styleWraps";
import { replaceDialogueSegments, splitDialogue, DialogueSegment } from "../../lib/subtitle/sentence/dialogue";
import { detectCueLeak, knownNamesOf } from "./untranslatedCue";
import type { TranslationRequest, TranslationResult } from "./types";

type Cue = TranslationRequest["cues"][number];

export interface JobAccumulator {
  seed(prior: TranslationResult): void;
  release(cueIds: ReadonlySet<number>): void;
  absorb(round: Partial<TranslationResult>): void;
  isOutstanding(cue: Pick<Cue, "id" | "text">): boolean;
  outstandingCues(): Cue[];
  hasAnyResult(): boolean;
  translatedCount(): number;
  retryToken(): string | undefined;
  displayProgress(partial: Partial<TranslationResult>): TranslationResult;
  finalize(): TranslationResult;
}

const hasText = (value: string | null | undefined): value is string => Boolean(value && value.trim() !== "");

interface SegmentLeak {
  translation: string;
  indexes: number[];
  originalSegments: DialogueSegment[];
}

const DIALOGUE_PREFIX = /^[-—–]\s*/;

function missingSegmentsText({ indexes, originalSegments }: SegmentLeak): string {
  const missing = indexes.map((index) => originalSegments[index]!.text);
  return missing.length === 1 ? missing[0]! : missing.map((text) => `- ${text}`).join("\n");
}

function retriedSegments(returned: string, expected: number): string[] | null {
  const parts = expected === 1 ? [returned.trim().replace(DIALOGUE_PREFIX, "")] : splitDialogue(returned);
  return parts.length === expected && parts.every(hasText) ? parts : null;
}

export function createJobAccumulator(job: TranslationRequest): JobAccumulator {
  const translated = new Map<number, string>();
  const music = new Map<number, boolean>();
  const leaked = new Map<number, string>();
  const segmentLeaks = new Map<number, SegmentLeak>();
  const display = new Map<number, string>();
  let approxSplits: TranslationResult["approx_splits"] = [];
  let qualityWarnings: TranslationResult["quality_warnings"] = [];
  const knownNames = knownNamesOf(job.glossary);
  let sourceLang = "";
  let provider: string | undefined;
  let retryToken: string | undefined;

  const isOutstanding = (cue: Pick<Cue, "id" | "text">) => hasTranslatableContent(cue.text) && !translated.get(cue.id)?.trim();

  const withoutSegmentRetry = (cue: Cue): Cue => {
    const leak = segmentLeaks.get(cue.id);
    return leak ? { ...cue, text: missingSegmentsText(leak) } : cue;
  };

  function absorbSegmentRetry(cue: Pick<Cue, "id" | "text"> & { translation?: string | null }, leak: SegmentLeak): void {
    segmentLeaks.delete(cue.id);
    const replacements = hasText(cue.translation) ? retriedSegments(cue.translation, leak.indexes.length) : null;
    if (!replacements) {
      segmentLeaks.set(cue.id, leak);
      return;
    }
    const merged = replaceDialogueSegments(leak.translation, new Map(leak.indexes.map((index, position) => [index, replacements[position]!])));
    translated.set(cue.id, merged);
    leaked.delete(cue.id);
    if (detectCueLeak(leak.originalSegments.map((segment) => segment.text).join(" "), merged, sourceLang || job.source, job.target, knownNames)) {
      qualityWarnings.push({ cue_id: cue.id, cps: 0, over_cps: false, over_length: false, leaked: true });
    }
  }

  return {
    seed(prior) {
      sourceLang ||= prior.resolved_source_lang;
      provider ||= prior.provider;
      for (const cue of prior.cues) {
        if (cue.is_music !== undefined) music.set(cue.id, cue.is_music);
        if (!hasText(cue.translation)) continue;
        translated.set(cue.id, cue.translation);
        display.set(cue.id, cue.translation);
      }
      approxSplits.push(...prior.approx_splits);
      qualityWarnings.push(...prior.quality_warnings);
    },

    release(cueIds) {
      approxSplits = approxSplits.filter((split) => !split.cues.some((id) => cueIds.has(id)));
      qualityWarnings = qualityWarnings.filter((warning) => !cueIds.has(warning.cue_id));
    },

    absorb(round) {
      sourceLang ||= round.resolved_source_lang || "";
      const detectionLang = sourceLang || job.source;
      for (const cue of round.cues ?? []) {
        if (cue.is_music !== undefined) music.set(cue.id, cue.is_music);
        const pendingSegments = segmentLeaks.get(cue.id);
        if (pendingSegments && joinCueLines(cue.text) === joinCueLines(missingSegmentsText(pendingSegments))) {
          absorbSegmentRetry(cue, pendingSegments);
          continue;
        }
        const leak = hasText(cue.translation) ? detectCueLeak(cue.text, cue.translation, detectionLang, job.target, knownNames) : null;
        if (!hasText(cue.translation)) {
          translated.delete(cue.id);
        } else if (leak) {
          if (leaked.has(cue.id)) {
            translated.set(cue.id, cue.translation);
            leaked.delete(cue.id);
            segmentLeaks.delete(cue.id);
            qualityWarnings.push({ cue_id: cue.id, cps: 0, over_cps: false, over_length: false, leaked: true });
          } else {
            leaked.set(cue.id, cue.translation);
            translated.delete(cue.id);
            if (leak.kind === "segments") segmentLeaks.set(cue.id, { translation: cue.translation, indexes: leak.indexes, originalSegments: leak.originalSegments });
          }
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
    outstandingCues: () => job.cues.filter(isOutstanding).map(withoutSegmentRetry),
    hasAnyResult: () => translated.size > 0 || leaked.size > 0,
    translatedCount: () => translated.size,
    retryToken: () => retryToken,

    displayProgress(partial) {
      for (const cue of partial.cues ?? []) if (hasText(cue.translation)) display.set(cue.id, cue.translation);
      return { ...(partial as TranslationResult), cues: job.cues.map((cue) => ({ ...cue, translation: display.get(cue.id) ?? null })) };
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
