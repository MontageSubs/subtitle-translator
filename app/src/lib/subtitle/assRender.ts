import { Cue, OutputMode, BilingualStacking, CueLayout } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';
import { resolveTopAlign, renderAnTag, AnCornerOrDefault, AUTO_TOP_ALIGN } from './topAlign';
import { joinCueLines, cleanPositionTags as cleanAssText } from './styleTagFold';
import { wrapLine } from './lineWrap';

const DEFAULT_CUE_SETTINGS = "0|Default||0|0|0|";

export function msToAssTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hh = Math.floor(clamped / 3_600_000);
  const mm = Math.floor((clamped % 3_600_000) / 60_000);
  const ss = Math.floor((clamped % 60_000) / 1_000);
  const cs = Math.round((clamped % 1_000) / 10);
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${hh}:${pad(mm, 2)}:${pad(ss, 2)}.${pad(cs, 2)}`;
}

function dialogueLine(layer: string, start: number, end: number, style: string, name: string, marginL: string, marginR: string, marginV: string, effect: string, text: string): string {
  const lineLayer = (layer !== undefined && layer.trim() !== "") ? layer.trim() : "0";
  return `Dialogue: ${lineLayer},${msToAssTime(start)},${msToAssTime(end)},${style},${name},${marginL},${marginR},${marginV},${effect},${text}`;
}

function buildSplitDialogueLines(
  cue: TranslateJobResponse["cues"][number], original: Cue | undefined, stacking: BilingualStacking, musicTopAlign: boolean,
  topAlignOverrides: Map<number, AnCornerOrDefault> | undefined, targetLang: string, useSecondaryStyleTag: boolean
): string[] {
  const settingsStr = (original?.cueSettings && original.cueSettings.includes("|")) ? original.cueSettings : DEFAULT_CUE_SETTINGS;
  const [layer, style, name, marginL, marginR, marginV, effect] = settingsStr.split("|");
  const processedText = cleanAssText(cue.text || original?.text || "").replace(/\n/g, "\\N");
  const wrappedTranslation = wrapLine(cleanAssText(cue.translation || ""), targetLang).replace(/\n/g, "\\N");
  const secondaryTag = useSecondaryStyleTag ? "{\\rSecondary}" : "";
  const topIsOriginal = stacking === "original_top";
  const topText = topIsOriginal ? processedText : `${secondaryTag}${wrappedTranslation}`;
  const bottomText = topIsOriginal ? `${secondaryTag}${wrappedTranslation}` : processedText;
  const topTag = renderAnTag(AUTO_TOP_ALIGN);
  const bottomAlign = resolveTopAlign(undefined, cue.is_music, musicTopAlign, topAlignOverrides?.get(cue.id));
  const bottomTag = renderAnTag(bottomAlign);
  return [
    dialogueLine(layer, cue.start_ms, cue.end_ms, style, name, marginL, marginR, marginV, effect, `${topTag}${topText}`),
    dialogueLine(layer, cue.start_ms, cue.end_ms, style, name, marginL, marginR, marginV, effect, `${bottomTag}${bottomText}`),
  ];
}

function buildDialogueLine(
  cue: TranslateJobResponse["cues"][number], original: Cue | undefined, mode: OutputMode, stacking: BilingualStacking, musicTopAlign: boolean,
  topAlignOverrides?: Map<number, AnCornerOrDefault>, useSecondaryStyleTag = false
): string {
  const settingsStr = (original?.cueSettings && original.cueSettings.includes("|")) ? original.cueSettings : DEFAULT_CUE_SETTINGS;
  const [layer, style, name, marginL, marginR, marginV, effect] = settingsStr.split("|");
  const pristineText = cleanAssText(original?.text || cue.text);
  const processedText = cleanAssText(cue.text || original?.text || "");
  const translationText = cleanAssText(cue.translation || "");
  const secondaryTag = useSecondaryStyleTag ? "{\\rSecondary}" : "";
  const bilingualLines = stacking === "original_top"
    ? [joinCueLines(processedText), `${secondaryTag}${joinCueLines(translationText)}`]
    : [joinCueLines(translationText), `${secondaryTag}${joinCueLines(processedText)}`];
  const lines = mode === "bilingual" ? (translationText ? bilingualLines : [pristineText.replace(/\n/g, "\\N")]) : [(translationText || pristineText).replace(/\n/g, "\\N")];
  const posTag = renderAnTag(resolveTopAlign(original, cue.is_music, musicTopAlign, topAlignOverrides?.get(cue.id)));
  const text = `${posTag}${lines.join("\\N")}`;
  return dialogueLine(layer, cue.start_ms, cue.end_ms, style, name, marginL, marginR, marginV, effect, text);
}

export function renderAss(
  cues: TranslateJobResponse["cues"], originalById: Map<number, Cue>, mode: OutputMode, stacking: BilingualStacking = "translation_top",
  musicTopAlign = false, topAlignOverrides?: Map<number, AnCornerOrDefault>, useSecondaryStyleTag = false, cueLayout: CueLayout = "single", targetLang = "en"
): string {
  const outputParts: string[] = [];
  for (const cue of cues) {
    const original = originalById.get(cue.id);
    if (original?.leadingBlocks?.length) outputParts.push(original.leadingBlocks.join("\n"));
    if (cueLayout === "split" && mode === "bilingual" && cue.translation) {
      outputParts.push(...buildSplitDialogueLines(cue, original, stacking, musicTopAlign, topAlignOverrides, targetLang, useSecondaryStyleTag));
    } else {
      outputParts.push(buildDialogueLine(cue, original, mode, stacking, musicTopAlign, topAlignOverrides, useSecondaryStyleTag));
    }
  }
  const last = originalById.get(cues[cues.length - 1]?.id);
  if (last?.trailingBlocks?.length) outputParts.push(last.trailingBlocks.join("\n"));
  return outputParts.join("\n") + "\n";
}
