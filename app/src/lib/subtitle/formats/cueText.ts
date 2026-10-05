import { Cue } from '../../../utils/types';
import { TranslateJobResponse } from '../../../api/translation';
import { cleanPositionTags } from '../postprocess/displayText';
import { CueRenderContext } from './renderContext';

export type RenderedCue = TranslateJobResponse["cues"][number];

export function cueTopAlignOverride(cue: RenderedCue, context: CueRenderContext) {
  return context.topAlignOverrides?.get(cue.id);
}

export function plainCueLines(cue: RenderedCue, original: Cue | undefined, context: CueRenderContext): string[] {
  const pristine = cleanPositionTags(original?.text || cue.text);
  const translation = cleanPositionTags(cue.translation || "");
  if (context.mode !== "bilingual") return [translation || pristine];
  if (!translation) return [pristine];
  const processed = cleanPositionTags(cue.text || original?.text || "");
  return context.stacking === "original_top" ? [processed, translation] : [translation, processed];
}
