import { buildCreditCue } from "../../lib/subtitle/formats/credit";
import { formatSubtitleTime } from "../../lib/subtitle/formats/formatTime";
import { Cue, SubtitleFormat, TranslatedCue } from "../../lib/subtitle/types";
import { PreviewCard } from "./types";

export interface CreditCardInput {
  enabled: boolean;
  cues: Pick<TranslatedCue, "id" | "end_ms">[];
  originalById: Map<number, Cue>;
  format: SubtitleFormat;
  sourceLang: string;
  targetLang: string;
}

export function withCreditCard(cards: PreviewCard[], input: CreditCardInput): PreviewCard[] {
  const credit = input.enabled ? buildCreditCue(input.cues, input.originalById, input.targetLang) : null;
  if (!credit) return cards;
  const { id, start_ms, end_ms, text } = credit.cue;
  return [...cards, {
    id,
    start: formatSubtitleTime(start_ms, input.format),
    end: formatSubtitleTime(end_ms, input.format),
    source: "",
    target: text,
    start_ms,
    end_ms,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    topAlignAn: 2,
    locked: true,
  }];
}
