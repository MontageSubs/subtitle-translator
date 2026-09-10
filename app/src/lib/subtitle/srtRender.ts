import { Cue, OutputMode, BilingualStacking } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';
import { resolveTopAlign, renderAnTag, AnCornerOrDefault } from './topAlign';
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


export function renderSrt(
  cues: TranslateJobResponse["cues"], originalById: Map<number, Cue>, mode: OutputMode, stacking: BilingualStacking = "translation_top",
  musicTopAlign = false, topAlignOverrides?: Map<number, AnCornerOrDefault>
): string {
  const blocks = cues.map((cue, i) => {
    const original = originalById.get(cue.id);
    const position = renderAnTag(resolveTopAlign(original, cue.is_music, musicTopAlign, topAlignOverrides?.get(cue.id)));
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
