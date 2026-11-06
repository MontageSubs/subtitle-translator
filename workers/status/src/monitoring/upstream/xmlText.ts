const ENTITY_PATTERN = /&(?:amp|lt|gt|quot|apos|nbsp|#39|#\d+|#x[0-9a-fA-F]+);/;

const NAMED_ENTITIES: readonly (readonly [RegExp, string])[] = [
  [/&amp;/g, "&"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&apos;/g, "'"],
  [/&#39;/g, "'"],
  [/&nbsp;/g, " "],
];

export function decodeXmlEntities(text: string): string {
  if (!ENTITY_PATTERN.test(text)) return text;
  return NAMED_ENTITIES.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

const CDATA_OPEN = "<![CDATA[";
const CDATA_CLOSE = "]]>";
const tagPatterns = new Map<string, readonly [RegExp, RegExp]>();

function patternsFor(tag: string): readonly [RegExp, RegExp] {
  let patterns = tagPatterns.get(tag);
  if (!patterns) {
    const name = `(?:[a-zA-Z0-9_-]+:)?${tag}`;
    patterns = [new RegExp(`<${name}`, "gi"), new RegExp(`</${name}>`, "gi")];
    tagPatterns.set(tag, patterns);
  }
  return patterns;
}

export function readTag(block: string, tag: string): string {
  const [openPattern, closePattern] = patternsFor(tag);
  openPattern.lastIndex = 0;
  const open = openPattern.exec(block);
  if (!open) return "";
  const openEnd = block.indexOf(">", openPattern.lastIndex);
  if (openEnd === -1) return "";
  closePattern.lastIndex = openEnd + 1;
  const close = closePattern.exec(block);
  if (!close) return "";
  let start = openEnd + 1;
  let end = close.index;
  if (block.slice(start, start + CDATA_OPEN.length).toUpperCase() === CDATA_OPEN) start += CDATA_OPEN.length;
  if (end - start >= CDATA_CLOSE.length && block.startsWith(CDATA_CLOSE, end - CDATA_CLOSE.length)) end -= CDATA_CLOSE.length;
  return block.slice(start, Math.max(start, end)).trim();
}
