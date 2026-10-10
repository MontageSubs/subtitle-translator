const OVERRIDE_BLOCK_PATTERN = /\{[^}]*\}/g;
const OVERRIDE_TAG_PATTERN = /\{\\[^}]*\}/g;
export const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/gi;
const ADJACENT_STYLE_WRAP_PATTERN = /<\/(i|b|u)>(\s*)<\1>/gi;

export const STYLE_TAG_PATTERN = /<\/?(i|b|u)>/gi;

export const stripMarkup = (text: string): string => text.replace(OVERRIDE_BLOCK_PATTERN, "").replace(HTML_TAG_PATTERN, "");

export const stripStyling = (text: string): string => text.replace(OVERRIDE_TAG_PATTERN, "").replace(STYLE_TAG_PATTERN, "");

export const collapseAdjacentStyleWraps = (text: string): string => text.replace(ADJACENT_STYLE_WRAP_PATTERN, "$2");
