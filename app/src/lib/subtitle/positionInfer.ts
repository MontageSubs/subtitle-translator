import { Cue } from '../../utils/types';

export function inferTopPosition(original: Cue | undefined, cueText?: string): string {
  if (original?.position) return original.position;
  const combined = `${original?.text || ""} ${cueText || ""} ${original?.cueSettings || ""}`;
  const match = combined.match(/\{\\an[1-9]\}|\\an[1-9]\b/i);
  if (match) {
    const tag = match[0];
    return tag.startsWith("{") ? tag : `{${tag}}`;
  }
  return /position:20%|line:20%|line:0%/i.test(combined) ? "{\\an7}" : "";
}
