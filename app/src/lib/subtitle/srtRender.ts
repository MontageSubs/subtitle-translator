import { Cue, OutputMode, BilingualStacking } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';

export function msToSrtTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hh = Math.floor(clamped / 3_600_000);
  const mm = Math.floor((clamped % 3_600_000) / 60_000);
  const ss = Math.floor((clamped % 60_000) / 1_000);
  const msRemainder = clamped % 1_000;
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)},${pad(msRemainder, 3)}`;
}

function cleanSrtText(raw: string): string {
  return raw.replace(/\{\\an[1-9]\}/g, "").trim();
}

function resolveSrtPosition(original: Cue | undefined, cueText?: string): string {
  if (original?.position) return original.position;
  const combined = (original?.text || "") + " " + (cueText || "") + " " + (original?.cueSettings || "");
  let pos = "";
  const match = combined.match(/\{\\an[1-9]\}|\\an[1-9]\b/i);
  if (match) {
    const tag = match[0];
    pos = tag.startsWith("{") ? tag : `{${tag}}`;
  } else if (/position:20%|line:20%|line:0%/i.test(combined)) {
    pos = "{\\an7}";
  }
  if (original && pos) original.position = pos;
  return pos;
}

export function renderSrt(
  cues: TranslateJobResponse["cues"], originalById: Map<number, Cue>, mode: OutputMode, stacking: BilingualStacking = "translation_top"
): string {
  const blocks = cues.map((cue, i) => {
    const original = originalById.get(cue.id);
    const position = resolveSrtPosition(original, cue.text);
    const originalText = cleanSrtText(original?.text || cue.text);
    const translationText = cleanSrtText(cue.translation || "");
    const bilingualLines = stacking === "original_top" ? [originalText, translationText] : [translationText, originalText];
    const lines = mode === "bilingual" ? (translationText ? bilingualLines : [originalText]) : [translationText || originalText];
    return `${i + 1}\n${msToSrtTime(cue.start_ms)} --> ${msToSrtTime(cue.end_ms)}\n${position}${lines.join("\n")}`;
  });
  return blocks.join("\n\n") + "\n";
}
