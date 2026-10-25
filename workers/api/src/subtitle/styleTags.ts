import { STYLE_TAG_PATTERN, removeMarkup } from "./common/markup";

export const hasStyleTag = (text: string): boolean => text.search(STYLE_TAG_PATTERN) >= 0;

export const stripTagsKeepingStyle = (text: string): string =>
  text.includes("<") || text.includes("{") ? removeMarkup(text, { tags: true, overrides: "any", keepStyle: true }) : text;

export const stripHtmlKeepingStyle = (text: string): string => (text.includes("<") ? removeMarkup(text, { tags: true, keepStyle: true }) : text);
