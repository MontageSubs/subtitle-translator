export function stripTags(text: string, replacement: string): string {
  if (!text.includes("<")) return text;
  let result = "";
  let cursor = 0;
  let open = text.indexOf("<");
  while (open !== -1) {
    const close = text.indexOf(">", open + 1);
    if (close === -1) break;
    if (close === open + 1) {
      open = text.indexOf("<", open + 1);
      continue;
    }
    result += text.slice(cursor, open) + replacement;
    cursor = close + 1;
    open = text.indexOf("<", cursor);
  }
  return result + text.slice(cursor);
}
