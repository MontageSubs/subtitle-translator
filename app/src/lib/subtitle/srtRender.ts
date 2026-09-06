import { Cue, OutputMode, BilingualStacking } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';
import { inferTopPosition } from './positionInfer';
import { joinCueLines, cleanPositionTags as cleanSrtText } from './styleTagFold';

export function msToSrtTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hh = Math.floor(clamped / 3_600_000);
  const mm = Math.floor((clamped % 3_600_000) / 60_000);
  const ss = Math.floor((clamped % 60_000) / 1_000);
  const msRemainder = clamped % 1_000;
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)},${pad(msRemainder, 3)}`;
}

export { cleanSrtText };


function resolveSrtPosition(original: Cue | undefined, cueText?: string): string {
  return inferTopPosition(original, cueText);
}

export function renderSrt(
  cues: TranslateJobResponse["cues"], originalById: Map<number, Cue>, mode: OutputMode, stacking: BilingualStacking = "translation_top"
): string {
  const blocks = cues.map((cue, i) => {
    const original = originalById.get(cue.id);
    const position = resolveSrtPosition(original, cue.text);
    const pristineText = cleanSrtText(original?.text || cue.text);
    const processedText = cleanSrtText(cue.text || original?.text || "");
    const translationText = cleanSrtText(cue.translation || "");
    const bilingualLines = stacking === "original_top"
      ? [joinCueLines(processedText), joinCueLines(translationText)]
      : [joinCueLines(translationText), joinCueLines(processedText)];
    const lines = mode === "bilingual" ? (translationText ? bilingualLines : [pristineText]) : [translationText || pristineText];
    return `${i + 1}\n${msToSrtTime(cue.start_ms)} --> ${msToSrtTime(cue.end_ms)}\n${position}${lines.join("\n")}`;
  });
  return blocks.join("\n\n") + "\n";
}
