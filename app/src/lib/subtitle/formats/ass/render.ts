import { Cue, TranslatedCue } from '../../types';
import { AnCornerOrDefault, renderAnTagAgainstStyle, topAlignOf } from '../topAlign';
import { isSplitLayout, splitBlockAns } from '../cueLayout';
import { cleanPositionTags, collapseLineBreaks } from '../../postprocess/displayText';
import { wrapLine } from '../../postprocess/lineWrap';
import { msToAssTime } from '../clock';
import { CueRenderContext, cueTopAlign, sourceTextKeepingBreaks } from '../renderShared';
import { secondaryStyleName } from './template';
import { hasPositioningTags, lineLevelTags, renderTaggedText } from './overrides';
import { assWholeLineFlags } from '../inlineStyle';

const DEFAULT_CUE_SETTINGS = "0|Default||0|0|0|".split("|");
const ASS_LINE_BREAK = "\\N";

export interface StyleAlignments {
  primary: AnCornerOrDefault;
  secondary: AnCornerOrDefault;
}

export interface AssDialogueOptions {
  useSecondaryStyleTag: boolean;
  secondaryLang: string;
  styleAlignments?: StyleAlignments;
}

interface DialogueSettings {
  layer: string;
  style: string;
  name: string;
  marginL: string;
  marginR: string;
  marginV: string;
  effect: string;
}

function dialogueSettings(original: Cue | undefined): DialogueSettings {
  const stored = original?.cueSettings?.includes("|") ? original.cueSettings.split("|") : DEFAULT_CUE_SETTINGS;
  const [layer, style, name, marginL, marginR, marginV, effect] = DEFAULT_CUE_SETTINGS.map((fallback, index) => stored[index] ?? fallback);
  return { layer: layer.trim() || "0", style, name, marginL, marginR, marginV, effect };
}

function dialogueLine(settings: DialogueSettings, cue: TranslatedCue, text: string): string {
  const { layer, style, name, marginL, marginR, marginV, effect } = settings;
  return `Dialogue: ${layer},${msToAssTime(cue.start_ms)},${msToAssTime(cue.end_ms)},${style},${name},${marginL},${marginR},${marginV},${effect},${text}`;
}

function toAssBreaks(text: string): string {
  return text.replace(/\n/g, ASS_LINE_BREAK);
}

function secondaryStyleSettings(settings: DialogueSettings, options: AssDialogueOptions): DialogueSettings {
  return options.useSecondaryStyleTag ? { ...settings, style: secondaryStyleName(settings.style, options.secondaryLang) } : settings;
}

function secondaryStyleTag(settings: DialogueSettings, options: AssDialogueOptions, original: Cue | undefined): string {
  return options.useSecondaryStyleTag ? `{\\r${secondaryStyleName(settings.style, options.secondaryLang)}}${assWholeLineFlags(original)}` : "";
}

function splitDialogueLines(cue: TranslatedCue, original: Cue | undefined, context: CueRenderContext, options: AssDialogueOptions): string[] {
  const settings = dialogueSettings(original);
  const processed = renderTaggedText(cleanPositionTags(sourceTextKeepingBreaks(cue, original)), original, false);
  const translation = toAssBreaks(wrapLine(cleanPositionTags(cue.translation || ""), context.targetLang));
  const wholeLineFlags = options.useSecondaryStyleTag ? assWholeLineFlags(original) : "";
  const originalOnTop = context.stacking === "original_top";
  const { top, bottom } = splitBlockAns(context.stacking, context.topAlignOverrides?.get(cue.id));
  const tags = lineLevelTags(original);
  const { styleAlignments } = options;
  return [
    dialogueLine(settings, cue, `${renderAnTagAgainstStyle(topAlignOf(top), styleAlignments?.primary)}${tags}${originalOnTop ? processed : translation}`),
    dialogueLine(secondaryStyleSettings(settings, options), cue, `${renderAnTagAgainstStyle(topAlignOf(bottom), styleAlignments?.secondary)}${tags}${wholeLineFlags}${originalOnTop ? translation : processed}`),
  ];
}

function dialogueLines(cue: TranslatedCue, original: Cue | undefined, context: CueRenderContext, options: AssDialogueOptions): string {
  const settings = dialogueSettings(original);
  const bilingual = context.mode === "bilingual";
  const pristine = cleanPositionTags(original?.text || cue.text);
  const translation = cleanPositionTags(cue.translation || "");
  let body: string;
  if (bilingual && translation) {
    const processed = renderTaggedText(collapseLineBreaks(cleanPositionTags(cue.text || original?.text || "")), original, false);
    const assTranslation = toAssBreaks(translation);
    const secondaryTag = secondaryStyleTag(settings, options, original);
    body = context.stacking === "original_top"
      ? `${processed}${ASS_LINE_BREAK}${secondaryTag}${assTranslation}`
      : `${assTranslation}${ASS_LINE_BREAK}${secondaryTag}${processed}`;
  } else {
    body = bilingual || !translation ? renderTaggedText(pristine, original, false) : toAssBreaks(translation);
  }
  const position = renderAnTagAgainstStyle(cueTopAlign(cue, original, context), options.styleAlignments?.primary);
  return dialogueLine(settings, cue, `${position}${lineLevelTags(original)}${body}`);
}

export function renderAssEvents(cues: TranslatedCue[], context: CueRenderContext, options: AssDialogueOptions): string {
  const parts: string[] = [];
  for (const cue of cues) {
    const original = context.originalById.get(cue.id);
    if (original?.leadingBlocks?.length) parts.push(original.leadingBlocks.join("\n"));
    if (isSplitLayout(context) && cue.translation && !hasPositioningTags(original)) {
      parts.push(...splitDialogueLines(cue, original, context, options));
    } else {
      parts.push(dialogueLines(cue, original, context, options));
    }
  }
  const trailing = context.originalById.get(cues[cues.length - 1]?.id)?.trailingBlocks;
  if (trailing?.length) parts.push(trailing.join("\n"));
  return parts.join("\n") + "\n";
}
