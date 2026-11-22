const UNFOLDED_PATTERN = /[^\S ]|  |^ | $/;
const WHITESPACE_RUN_PATTERN = /\s+/g;

export const foldWhitespace = (text: string): string => (UNFOLDED_PATTERN.test(text) ? text.replace(WHITESPACE_RUN_PATTERN, " ").trim() : text);
