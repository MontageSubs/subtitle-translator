import { Cue, OutputMode, BilingualStacking, CueLayout, TranslatedCue } from '../types';
import { cleanPositionTags, collapseLineBreaks, dropBlankLines } from '../postprocess/displayText';
import { AnCornerOrDefault, TopAlign } from './topAlign';
import { resolveCuePlacement } from './cueLayout';
import { htmlStyledText, wrapWholeLine } from './inlineStyle';
import { joinCueLines } from '../extraction/styleWraps';

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

export function sourceTextKeepingBreaks(cue: TranslatedCue, original: Cue | undefined): string {
  const pristine = original?.text;
  return pristine && joinCueLines(pristine) === joinCueLines(cue.text) ? pristine : cue.text || pristine || "";
}

export function plainCueLines(cue: TranslatedCue, original: Cue | undefined, context: CueRenderContext): string[] {
  const pristine = htmlStyledText(cleanPositionTags(original?.text || cue.text), original);
  const translation = dropBlankLines(wrapWholeLine(cleanPositionTags(cue.translation || ""), original));
  if (context.mode !== "bilingual") return [translation || pristine];
  if (!translation) return [pristine];
  const processed = collapseLineBreaks(htmlStyledText(cleanPositionTags(cue.text || original?.text || ""), original));
  return context.stacking === "original_top" ? [processed, translation] : [translation, processed];
}
