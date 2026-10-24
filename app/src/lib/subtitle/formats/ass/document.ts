import { TranslatedCue } from '../../types';
import { CueRenderContext } from '../renderShared';
import { isSplitLayout } from '../cueLayout';
import { renderAssEvents } from './render';
import { buildAssHeader, cueStyleName, defaultAssFontPlan, fontPlatformFor, mergeIntoOriginalAssHeader, AssFontPreset } from './template';

export interface AssDocumentOptions {
  sourceLang: string;
  fontPreset?: AssFontPreset;
  customPrimarySize?: number;
  customSecondarySize?: number;
  stampComment: boolean;
}

export function renderAssDocument(cues: TranslatedCue[], context: CueRenderContext, options: AssDocumentOptions): string {
  const { originalById, targetLang } = context;
  const { sourceLang, fontPreset, customPrimarySize, customSecondarySize, stampComment } = options;
  const bilingual = context.mode === "bilingual";
  const equalSize = isSplitLayout(context);
  const originalFirst = bilingual && context.stacking === "original_top";
  const primaryLang = originalFirst ? sourceLang : targetLang;
  const secondaryLang = originalFirst ? targetLang : sourceLang;
  const originalHeader = originalById.get(cues[0]?.id)?.assHeader;

  const header = originalHeader
    ? mergeIntoOriginalAssHeader(originalHeader, {
        bilingual, sourceLang, primaryLang, secondaryLang, stampComment,
        equalSize,
        platform: fontPlatformFor(fontPreset),
        usedStyles: [...new Set(cues.map((cue) => cueStyleName(originalById.get(cue.id)?.cueSettings)))],
      })
    : buildAssHeader({
        bilingual, secondaryLang, stampComment,
        fonts: defaultAssFontPlan(primaryLang, secondaryLang, bilingual, equalSize, { preset: fontPreset, customPrimarySize, customSecondarySize }),
      });

  return `${header}\n${renderAssEvents(cues, context, { useSecondaryStyleTag: bilingual, secondaryLang })}`;
}
