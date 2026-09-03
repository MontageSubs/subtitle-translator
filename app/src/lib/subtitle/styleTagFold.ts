const STYLE_CLOSE_AT_END_PATTERN = /<\/(i|b|u)>$/i;
const STYLE_OPEN_AT_START_PATTERN = /^<(i|b|u)>/i;

export function collapseAdjacentStyleWraps(lines: string[]): string[] {
  const result = lines.slice();
  for (let i = 0; i < result.length - 1; i++) {
    const endMatch = STYLE_CLOSE_AT_END_PATTERN.exec(result[i]);
    const startMatch = STYLE_OPEN_AT_START_PATTERN.exec(result[i + 1]);
    if (endMatch && startMatch && endMatch[1].toLowerCase() === startMatch[1].toLowerCase()) {
      result[i] = result[i].slice(0, endMatch.index);
      result[i + 1] = result[i + 1].slice(startMatch[0].length);
    }
  }
  return result;
}

export function joinCueLines(text: string): string {
  const lines = collapseAdjacentStyleWraps(text.split("\n").map((line) => line.trim()));
  return lines.filter(Boolean).join(" ");
}
