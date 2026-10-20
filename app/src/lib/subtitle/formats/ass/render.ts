import { Cue, TranslatedCue } from '../../types';
import { renderAnTag, topAlignOf } from '../topAlign';
import { isSplitLayout, splitBlockAns } from '../cueLayout';
import { cleanPositionTags, collapseLineBreaks } from '../../postprocess/displayText';
import { wrapLine } from '../../postprocess/lineWrap';
import { msToAssTime } from '../clock';
import { CueRenderContext, cueTopAlign } from '../renderShared';
import { secondaryStyleName } from './template';
import { hasPositioningTags, lineLevelTags, renderTaggedText } from './overrides';
import { assWholeLineFlags } from '../inlineStyle';

const DEFAULT_CUE_SETTINGS = "0|Default||0|0|0|".split("|");
const ASS_LINE_BREAK = "\\N";

export interface AssDialogueOptions {
  useSecondaryStyleTag: boolean;
  secondaryLang: string;
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

function secondaryStyleTag(settings: DialogueSettings, options: AssDialogueOptions, original: Cue | undefined): string {
  return options.useSecondaryStyleTag ? `{\\r${secondaryStyleName(settings.style, options.secondaryLang)}}${assWholeLineFlags(original)}` : "";
}

function splitDialogueLines(cue: TranslatedCue, original: Cue | undefined, context: CueRenderContext, options: AssDialogueOptions): string[] {
  const settings = dialogueSettings(original);
  const processed = renderTaggedText(cleanPositionTags(cue.text || original?.text || ""), original, false);
  const translation = toAssBreaks(wrapLine(cleanPositionTags(cue.translation || ""), context.targetLang, cue.end_ms - cue.start_ms));
  const secondaryTag = secondaryStyleTag(settings, options, original);
  const originalOnTop = context.stacking === "original_top";
  const { top, bottom } = splitBlockAns(context.stacking, context.topAlignOverrides?.get(cue.id));
  const tags = lineLevelTags(original);
  return [
    dialogueLine(settings, cue, `${renderAnTag(topAlignOf(top))}${tags}${originalOnTop ? processed : translation}`),
    dialogueLine(settings, cue, `${renderAnTag(topAlignOf(bottom))}${tags}${secondaryTag}${originalOnTop ? translation : processed}`),
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
    const collapsedTranslation = collapseLineBreaks(translation);
    const secondaryTag = secondaryStyleTag(settings, options, original);
    body = context.stacking === "original_top"
      ? `${processed}${ASS_LINE_BREAK}${secondaryTag}${collapsedTranslation}`
      : `${collapsedTranslation}${ASS_LINE_BREAK}${secondaryTag}${processed}`;
  } else {
    body = bilingual || !translation ? renderTaggedText(pristine, original, false) : toAssBreaks(translation);
  }
  const position = renderAnTag(cueTopAlign(cue, original, context));
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
