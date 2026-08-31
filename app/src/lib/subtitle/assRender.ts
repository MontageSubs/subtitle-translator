import { Cue, OutputMode, BilingualStacking } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';

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

function cleanAssText(raw: string): string {
  return raw.replace(/\{\\an[1-9]\}/g, "").trim();
}

function resolveAssPosition(original: Cue | undefined): string {
  if (original?.position) return original.position;
  if (original?.cueSettings && /position:20%|line:20%|line:0%/i.test(original.cueSettings)) {
    return "{\\an7}";
  }
  return "";
}

function buildDialogueLine(
  cue: TranslateJobResponse["cues"][number], original: Cue | undefined, mode: OutputMode, stacking: BilingualStacking
): string {
  const settingsStr = (original?.cueSettings && original.cueSettings.includes("|")) ? original.cueSettings : DEFAULT_CUE_SETTINGS;
  const [layer, style, name, marginL, marginR, marginV, effect] = settingsStr.split("|");
  const originalText = cleanAssText(original?.text || cue.text);
  const translationText = cleanAssText(cue.translation || "");
  const bilingualLines = stacking === "original_top" ? [originalText, translationText] : [translationText, originalText];
  const lines = mode === "bilingual" ? (translationText ? bilingualLines : [originalText]) : [translationText || originalText];
  const posTag = resolveAssPosition(original);
  const text = `${posTag}${lines.join("\\N")}`;
  const lineLayer = (layer !== undefined && layer.trim() !== "") ? layer.trim() : "0";
  return `Dialogue: ${lineLayer},${msToAssTime(cue.start_ms)},${msToAssTime(cue.end_ms)},${style},${name},${marginL},${marginR},${marginV},${effect},${text}`;
}

export function renderAss(
  cues: TranslateJobResponse["cues"], originalById: Map<number, Cue>, mode: OutputMode, stacking: BilingualStacking = "translation_top"
): string {
  const outputParts: string[] = [];
  for (const cue of cues) {
    const original = originalById.get(cue.id);
    if (original?.leadingBlocks?.length) outputParts.push(original.leadingBlocks.join("\n"));
    outputParts.push(buildDialogueLine(cue, original, mode, stacking));
  }
  const last = originalById.get(cues[cues.length - 1]?.id);
  if (last?.trailingBlocks?.length) outputParts.push(last.trailingBlocks.join("\n"));
  return outputParts.join("\n") + "\n";
}
