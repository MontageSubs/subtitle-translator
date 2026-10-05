const INLINE_WHITESPACE_PATTERN = /[^\S\n]+/g;
const AN_OVERRIDE_PATTERN = /\{\\an[1-9]\}/g;

export function normalizeNewlines(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
}

export function tidyLines(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(INLINE_WHITESPACE_PATTERN, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function stripAnOverrides(raw: string): string {
  return raw.replace(AN_OVERRIDE_PATTERN, "");
}
