import { Cue } from '../../../../utils/types';
import { renderAnTag, resolveTopAlign, AUTO_TOP_ALIGN } from '../topAlign';
import { cleanPositionTags } from '../../postprocess/displayText';
import { wrapLine } from '../../postprocess/lineWrap';
import { msToAssTime } from '../clock';
import { RenderedCue, cueTopAlignOverride } from '../cueText';
import { CueRenderContext } from '../renderContext';
import { secondaryStyleName } from './template';

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

function dialogueLine(settings: DialogueSettings, cue: RenderedCue, text: string): string {
  const { layer, style, name, marginL, marginR, marginV, effect } = settings;
  return `Dialogue: ${layer},${msToAssTime(cue.start_ms)},${msToAssTime(cue.end_ms)},${style},${name},${marginL},${marginR},${marginV},${effect},${text}`;
}

function toAssBreaks(text: string): string {
  return text.replace(/\n/g, ASS_LINE_BREAK);
}

function secondaryStyleTag(settings: DialogueSettings, options: AssDialogueOptions): string {
  return options.useSecondaryStyleTag ? `{\\r${secondaryStyleName(settings.style, options.secondaryLang)}}` : "";
}

function splitDialogueLines(cue: RenderedCue, original: Cue | undefined, context: CueRenderContext, options: AssDialogueOptions): string[] {
  const settings = dialogueSettings(original);
  const processed = toAssBreaks(cleanPositionTags(cue.text || original?.text || ""));
  const translation = toAssBreaks(wrapLine(cleanPositionTags(cue.translation || ""), context.targetLang, cue.end_ms - cue.start_ms));
  const secondaryTag = secondaryStyleTag(settings, options);
  const originalOnTop = context.stacking === "original_top";
  const bottomAlign = resolveTopAlign(undefined, cue.is_music, context.musicTopAlign, cueTopAlignOverride(cue, context));
  return [
    dialogueLine(settings, cue, `${renderAnTag(AUTO_TOP_ALIGN)}${originalOnTop ? processed : translation}`),
    dialogueLine(settings, cue, `${renderAnTag(bottomAlign)}${secondaryTag}${originalOnTop ? translation : processed}`),
  ];
}

function dialogueLines(cue: RenderedCue, original: Cue | undefined, context: CueRenderContext, options: AssDialogueOptions): string {
  const settings = dialogueSettings(original);
  const bilingual = context.mode === "bilingual";
  const pristine = cleanPositionTags(original?.text || cue.text);
  const translation = cleanPositionTags(cue.translation || "");
  let body: string;
  if (bilingual && translation) {
    const processed = collapseBreaks(cleanPositionTags(cue.text || original?.text || ""));
    const collapsedTranslation = collapseBreaks(translation);
    const secondaryTag = secondaryStyleTag(settings, options);
    body = context.stacking === "original_top"
      ? `${processed}${ASS_LINE_BREAK}${secondaryTag}${collapsedTranslation}`
      : `${collapsedTranslation}${ASS_LINE_BREAK}${secondaryTag}${processed}`;
  } else {
    body = toAssBreaks(bilingual ? pristine : translation || pristine);
  }
  const position = renderAnTag(resolveTopAlign(original, cue.is_music, context.musicTopAlign, cueTopAlignOverride(cue, context)));
  return dialogueLine(settings, cue, `${position}${body}`);
}

function collapseBreaks(text: string): string {
  return text.replace(/\n+/g, " ").trim();
}

export function renderAssEvents(cues: RenderedCue[], context: CueRenderContext, options: AssDialogueOptions): string {
  const parts: string[] = [];
  for (const cue of cues) {
    const original = context.originalById.get(cue.id);
    if (original?.leadingBlocks?.length) parts.push(original.leadingBlocks.join("\n"));
    if (context.cueLayout === "split" && context.mode === "bilingual" && cue.translation) {
      parts.push(...splitDialogueLines(cue, original, context, options));
    } else {
      parts.push(dialogueLines(cue, original, context, options));
    }
  }
  const trailing = context.originalById.get(cues[cues.length - 1]?.id)?.trailingBlocks;
  if (trailing?.length) parts.push(trailing.join("\n"));
  return parts.join("\n") + "\n";
}
