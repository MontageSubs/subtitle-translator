import { Cue, OutputMode, BilingualStacking, CueLayout } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';
import { resolveTopAlign, renderVttSettings, AnCornerOrDefault, AUTO_TOP_ALIGN } from './topAlign';
import { joinCueLines, cleanPositionTags as cleanVttText } from './styleTagFold';
import { wrapLine } from './lineWrap';

export function msToVttTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hh = Math.floor(clamped / 3_600_000);
  const mm = Math.floor((clamped % 3_600_000) / 60_000);
  const ss = Math.floor((clamped % 60_000) / 1_000);
  const msRemainder = clamped % 1_000;
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}.${pad(msRemainder, 3)}`;
}

function resolveVttSettings(
  original: Cue | undefined, isMusic: boolean | undefined, musicTopAlign: boolean, override: AnCornerOrDefault | undefined
): string {
  const topAlign = resolveTopAlign(original, isMusic, musicTopAlign, override);
  if (topAlign) return renderVttSettings(topAlign);
  if (original?.cueSettings && !original.cueSettings.includes("|") && original.cueSettings.trim()) {
    return ` ${original.cueSettings.trim()}`;
  }
  return "";
}

export function renderVtt(
  cues: TranslateJobResponse["cues"], originalById: Map<number, Cue>, mode: OutputMode, stacking: BilingualStacking = "translation_top",
  musicTopAlign = false, topAlignOverrides?: Map<number, AnCornerOrDefault>, cueLayout: CueLayout = "single", targetLang = "en"
): string {
  if (!cues.length) return "WEBVTT\n";

  const firstOriginal = originalById.get(cues[0]?.id);
  const vttHeader = firstOriginal?.vttHeader || "WEBVTT";
  const outputParts: string[] = [vttHeader];

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const original = originalById.get(cue.id);
    
    if (original?.leadingBlocks?.length) {
      outputParts.push(original.leadingBlocks.join("\n\n"));
    }

    const identifier = original?.identifier ? `${original.identifier}\n` : "";
    const pristineText = cleanVttText(original?.text || cue.text);
    const processedText = cleanVttText(cue.text || original?.text || "");
    const translationText = cleanVttText(cue.translation || "");

    if (cueLayout === "split" && mode === "bilingual" && translationText) {
      const topIsOriginal = stacking === "original_top";
      const wrappedTranslation = wrapLine(translationText, targetLang);
      const topText = topIsOriginal ? processedText : wrappedTranslation;
      const bottomText = topIsOriginal ? wrappedTranslation : processedText;
      const topSettings = renderVttSettings(AUTO_TOP_ALIGN);
      const bottomSettings = resolveVttSettings(undefined, cue.is_music, musicTopAlign, topAlignOverrides?.get(cue.id));
      const timing = `${msToVttTime(cue.start_ms)} --> ${msToVttTime(cue.end_ms)}`;
      outputParts.push(`${identifier}${timing}${topSettings}\n${topText}`);
      outputParts.push(`${identifier ? identifier.replace(/\n$/, "-b\n") : ""}${timing}${bottomSettings}\n${bottomText}`);
      continue;
    }

    const settings = resolveVttSettings(original, cue.is_music, musicTopAlign, topAlignOverrides?.get(cue.id));
    const bilingualLines = stacking === "original_top"
      ? [joinCueLines(processedText), joinCueLines(translationText)]
      : [joinCueLines(translationText), joinCueLines(processedText)];
    const lines = mode === "bilingual" ? (translationText ? bilingualLines : [pristineText]) : [translationText || pristineText];
    const timing = `${msToVttTime(cue.start_ms)} --> ${msToVttTime(cue.end_ms)}${settings}`;

    outputParts.push(`${identifier}${timing}\n${lines.join("\n")}`);
  }

  const lastOriginal = originalById.get(cues[cues.length - 1]?.id);
  if (lastOriginal?.trailingBlocks?.length) {
    outputParts.push(lastOriginal.trailingBlocks.join("\n\n"));
  }

  return `${outputParts.join("\n\n")}\n`;
}
