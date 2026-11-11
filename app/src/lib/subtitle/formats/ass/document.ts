import { TranslatedCue } from '../../types';
import { CueRenderContext } from '../renderShared';
import { isSplitLayout, splitBlockAns } from '../cueLayout';
import { renderAssEvents } from './render';
import { assHeaderStyleSize, buildAssHeader, cueStyleName, defaultAssFontPlan, fontPlatformFor, mergeIntoOriginalAssHeader, secondarySizeRatio, AssFontPreset } from './template';

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
  const splitBands = equalSize ? splitBlockAns(context.stacking) : undefined;
  const styleAlignments = !originalHeader && splitBands ? { primary: splitBands.top, secondary: splitBands.bottom } : undefined;

  const referenceSize = originalHeader ? assHeaderStyleSize(originalHeader, cueStyleName(originalById.get(cues[0].id)?.cueSettings)) : undefined;
  const secondaryRatio = secondarySizeRatio(fontPreset, referenceSize ?? 1, customSecondarySize);

  const header = originalHeader
    ? mergeIntoOriginalAssHeader(originalHeader, {
        bilingual, sourceLang, primaryLang, secondaryLang, stampComment,
        equalSize, secondaryRatio,
        platform: fontPlatformFor(fontPreset),
        usedStyles: [...new Set(cues.map((cue) => cueStyleName(originalById.get(cue.id)?.cueSettings)))],
      })
    : buildAssHeader({
        bilingual, secondaryLang, stampComment, styleAlignments,
        fonts: defaultAssFontPlan(primaryLang, secondaryLang, bilingual, equalSize, { preset: fontPreset, customPrimarySize, customSecondarySize }),
      });

  return `${header}\n${renderAssEvents(cues, context, { useSecondaryStyleTag: bilingual, secondaryLang, styleAlignments })}`;
}
