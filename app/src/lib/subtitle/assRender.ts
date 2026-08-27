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

function buildDialogueLine(
  cue: TranslateJobResponse["cues"][number], original: Cue | undefined, mode: OutputMode, stacking: BilingualStacking
): string {
  const [layer, style, name, marginL, marginR, marginV, effect] = (original?.cueSettings || DEFAULT_CUE_SETTINGS).split("|");
  const translation = cue.translation || "";
  const bilingualLines = stacking === "original_top" ? [cue.text, translation] : [translation, cue.text];
  const lines = mode === "bilingual" ? (translation ? bilingualLines : [cue.text]) : [translation || cue.text];
  const text = `${original?.position || ""}${lines.join("\\N")}`;
  return `Dialogue: ${layer},${msToAssTime(cue.start_ms)},${msToAssTime(cue.end_ms)},${style},${name},${marginL},${marginR},${marginV},${effect},${text}`;
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
