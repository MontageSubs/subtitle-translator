import { Cue, OutputMode, BilingualStacking, CueLayout, TranslatedCue } from '../types';
import { cleanPositionTags, collapseLineBreaks } from '../postprocess/displayText';
import { AnCornerOrDefault } from './topAlign';

export interface CueRenderContext {
  originalById: Map<number, Cue>;
  mode: OutputMode;
  stacking: BilingualStacking;
  musicTopAlign: boolean;
  topAlignOverrides?: Map<number, AnCornerOrDefault>;
  cueLayout: CueLayout;
  targetLang: string;
}

export function cueTopAlignOverride(cue: TranslatedCue, context: CueRenderContext): AnCornerOrDefault | undefined {
  return context.topAlignOverrides?.get(cue.id);
}

export function plainCueLines(cue: TranslatedCue, original: Cue | undefined, context: CueRenderContext): string[] {
  const pristine = cleanPositionTags(original?.text || cue.text);
  const translation = cleanPositionTags(cue.translation || "");
  if (context.mode !== "bilingual") return [translation || pristine];
  if (!translation) return [pristine];
  const flatten = context.cueLayout === "split" ? (text: string) => text : collapseLineBreaks;
  const processed = flatten(cleanPositionTags(cue.text || original?.text || ""));
  const flattenedTranslation = flatten(translation);
  return context.stacking === "original_top" ? [processed, flattenedTranslation] : [flattenedTranslation, processed];
}
