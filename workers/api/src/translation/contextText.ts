export const MAX_CONTEXT_CHARS = 500;

const INPUT_SAFETY_CHARS = 2000;
const ASCII_LETTER = /^[A-Za-z]$/;

export function truncateContext(text: string, maxChars: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  const cut = chars.slice(0, maxChars).join("");
  if (ASCII_LETTER.test(chars[maxChars - 1] ?? "") && ASCII_LETTER.test(chars[maxChars] ?? "")) {
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 0) return cut.slice(0, lastSpace).trimEnd();
  }
  return cut.trimEnd();
}

export const normalizeContext = (text: unknown): string | undefined =>
  typeof text === "string" ? truncateContext(text.trim().slice(0, INPUT_SAFETY_CHARS), MAX_CONTEXT_CHARS) : undefined;
