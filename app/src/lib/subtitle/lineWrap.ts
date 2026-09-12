import { isCjkLanguage, languageProfile } from '../../utils/languageProfiles';

const CJK_NO_LINE_START = new Set(["。", "，", "、", "！", "？", "」", "』", "）", "】", "：", "；", ".", ",", ")", "]"]);

function wrapByCharacter(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const ch of text) {
    if (current.length >= maxChars) {
      if (CJK_NO_LINE_START.has(ch) && lines.length + (current ? 1 : 0) > 0) {
        current += ch;
        continue;
      }
      lines.push(current);
      current = "";
    }
    current += ch;
  }
  if (current) lines.push(current);
  return lines;
}

function wrapByWord(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function wrapLine(text: string, langCode: string, maxLines = 2): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const profile = languageProfile(langCode);
  const cjk = isCjkLanguage(langCode);
  const rawLines = cjk ? wrapByCharacter(trimmed, profile.maxCharsPerLine) : wrapByWord(trimmed, profile.maxCharsPerLine);
  if (rawLines.length <= maxLines) return rawLines.join("\n");
  const head = rawLines.slice(0, maxLines - 1);
  const tail = rawLines.slice(maxLines - 1).join(cjk ? "" : " ");
  return [...head, tail].join("\n");
}
