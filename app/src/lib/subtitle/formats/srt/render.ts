import { renderAnTag, resolveTopAlign } from '../topAlign';
import { msToSrtTime } from '../clock';
import { TranslatedCue } from '../../types';
import { CueRenderContext, cueTopAlignOverride, plainCueLines } from '../renderShared';

export function renderSrt(cues: TranslatedCue[], context: CueRenderContext): string {
  const blocks = cues.map((cue, index) => {
    const original = context.originalById.get(cue.id);
    const position = renderAnTag(resolveTopAlign(original, cue.is_music, context.musicTopAlign, cueTopAlignOverride(cue, context)));
    const text = plainCueLines(cue, original, context).join("\n");
    return `${index + 1}\n${msToSrtTime(cue.start_ms)} --> ${msToSrtTime(cue.end_ms)}\n${position}${text}`;
  });
  return blocks.join("\n\n") + "\n";
}
