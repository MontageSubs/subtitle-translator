const STYLE_TAG_TOKEN_PATTERN = /<(\/?)(i|b|u)>/gi;

export function isolateStyleLines(lines: string[]): string[] {
  if (!lines.some((line) => line.includes("<"))) return lines;
  const open: string[] = [];
  return lines.map((line) => {
    const carried = open.map((name) => `<${name}>`).join("");
    for (const [, closing, name] of line.matchAll(STYLE_TAG_TOKEN_PATTERN)) {
      const tag = name!.toLowerCase();
      if (!closing) open.push(tag);
      else if (open.includes(tag)) open.splice(open.lastIndexOf(tag), 1);
    }
    const pending = open.map((name) => `</${name}>`).reverse().join("");
    return carried + line + pending;
  });
}
