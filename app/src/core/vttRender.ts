import { Cue, OutputMode, BilingualStacking } from "./types";
import { TranslateJobResponse } from "./workerClient";

export function msToVttTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hh = Math.floor(clamped / 3_600_000);
  const mm = Math.floor((clamped % 3_600_000) / 60_000);
  const ss = Math.floor((clamped % 60_000) / 1_000);
  const msRemainder = clamped % 1_000;
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}.${pad(msRemainder, 3)}`;
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
    const settings = original?.cueSettings ? ` ${original.cueSettings}` : "";
    const translation = cue.translation || "";
    const bilingualLines = stacking === "original_top" ? [cue.text, translation] : [translation, cue.text];
    const lines = mode === "bilingual" ? (translation ? bilingualLines : [cue.text]) : [translation || cue.text];
    const timing = `${msToVttTime(cue.start_ms)} --> ${msToVttTime(cue.end_ms)}${settings}`;

    outputParts.push(`${identifier}${timing}\n${lines.join("\n")}`);
  }

  const lastOriginal = originalById.get(cues[cues.length - 1]?.id);
  if (lastOriginal?.trailingBlocks?.length) {
    outputParts.push(lastOriginal.trailingBlocks.join("\n\n"));
  }

  return `${outputParts.join("\n\n")}\n`;
}
