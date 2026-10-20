import { Cue, OutputMode, BilingualStacking, CueLayout, TranslatedCue } from '../types';
import { cleanPositionTags, collapseLineBreaks } from '../postprocess/displayText';
import { AnCornerOrDefault, TopAlign } from './topAlign';
import { resolveCuePlacement } from './cueLayout';
import { htmlStyledText, wrapWholeLine } from './inlineStyle';

export interface CueRenderContext {
  originalById: Map<number, Cue>;
  mode: OutputMode;
  stacking: BilingualStacking;
  musicTopAlign: boolean;
  topAlignOverrides?: Map<number, AnCornerOrDefault>;
  cueLayout: CueLayout;
  targetLang: string;
}

export function cueTopAlign(cue: TranslatedCue, original: Cue | undefined, context: CueRenderContext): TopAlign | undefined {
  return resolveCuePlacement(context, original, cue.is_music, context.musicTopAlign, context.topAlignOverrides?.get(cue.id));
}

export function plainCueLines(cue: TranslatedCue, original: Cue | undefined, context: CueRenderContext): string[] {
  const pristine = htmlStyledText(cleanPositionTags(original?.text || cue.text), original);
  const translation = wrapWholeLine(cleanPositionTags(cue.translation || ""), original);
  if (context.mode !== "bilingual") return [translation || pristine];
  if (!translation) return [pristine];
  const processed = collapseLineBreaks(htmlStyledText(cleanPositionTags(cue.text || original?.text || ""), original));
  const flattenedTranslation = collapseLineBreaks(translation);
  return context.stacking === "original_top" ? [processed, flattenedTranslation] : [flattenedTranslation, processed];
}
