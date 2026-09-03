import { Cue, OutputMode, BilingualStacking } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';
import { joinCueLines } from './styleTagFold';

export function msToVttTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hh = Math.floor(clamped / 3_600_000);
  const mm = Math.floor((clamped % 3_600_000) / 60_000);
  const ss = Math.floor((clamped % 60_000) / 1_000);
  const msRemainder = clamped % 1_000;
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}.${pad(msRemainder, 3)}`;
}

function cleanVttText(raw: string): string {
  return raw.replace(/\{\\an[1-9]\}/g, "").trim();
}

function resolveVttSettings(original: Cue | undefined, cueText?: string): string {
  const combined = (original?.position || "") + " " + (original?.cueSettings || "") + " " + (original?.text || "") + " " + (cueText || "");
  const hasTopPos = /\\an[789]\b|position:20%|line:20%|line:0%/i.test(combined);
  if (original?.cueSettings && !original.cueSettings.includes("|") && original.cueSettings.trim()) {
    return ` ${original.cueSettings.trim()}`;
  }
  return hasTopPos ? " position:20% line:20%" : "";
}

export function renderVtt(
  cues: TranslateJobResponse["cues"], originalById: Map<number, Cue>, mode: OutputMode, stacking: BilingualStacking = "translation_top"
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
    const settings = resolveVttSettings(original, cue.text);
    const pristineText = cleanVttText(original?.text || cue.text);
    const processedText = cleanVttText(cue.text || original?.text || "");
    const translationText = cleanVttText(cue.translation || "");
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
