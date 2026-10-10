import { HTML_TAG_PATTERN, STYLE_TAG_PATTERN } from "./common/markup";

const HTML_OR_OVERRIDE_PATTERN = new RegExp(`${HTML_TAG_PATTERN.source}|\\{[^}]*\\}`, "gi");
const PLACEHOLDER_PATTERN = /\u0001(\d+)\u0001/g;

export const hasStyleTag = (text: string): boolean => text.search(STYLE_TAG_PATTERN) >= 0;

function stripKeepingStyle(text: string, pattern: RegExp): string {
  const preserved: string[] = [];
  const guarded = text.replace(STYLE_TAG_PATTERN, (tag) => `\u0001${preserved.push(tag.toLowerCase()) - 1}\u0001`);
  return guarded.replace(pattern, "").replace(PLACEHOLDER_PATTERN, (_, index) => preserved[Number(index)]!);
}

export const stripTagsKeepingStyle = (text: string): string =>
  text.includes("<") || text.includes("{") ? stripKeepingStyle(text, HTML_OR_OVERRIDE_PATTERN) : text;

export const stripHtmlKeepingStyle = (text: string): string => (text.includes("<") ? stripKeepingStyle(text, HTML_TAG_PATTERN) : text);
