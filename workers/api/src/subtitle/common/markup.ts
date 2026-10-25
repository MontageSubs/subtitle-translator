const ADJACENT_STYLE_WRAP_PATTERN = /<\/(i|b|u)>(\s*)<\1>/gi;
const MARKER_BODY_PATTERN = /[^⟦⟧]*⟧/y;
const MARKUP_START_PATTERN = /[<{]/g;
const MARKUP_OR_MARKER_START_PATTERN = /[<{⟦]/g;

export const STYLE_TAG_ALT = "(?:</?(?:i|b|u)>)";
export const STYLE_OPEN_ALT = "(?:<(?:i|b|u)>)";
export const STYLE_CLOSE_ALT = "(?:</(?:i|b|u)>)";
export const STYLE_TAG_PATTERN = new RegExp(STYLE_TAG_ALT, "gi");

export interface MarkupRemoval {
  tags?: boolean;
  overrides?: "any" | "ass";
  markers?: boolean;
  keepStyle?: boolean;
}

const isAsciiLetter = (code: number): boolean => (code | 32) >= 97 && (code | 32) <= 122;
const isStyleLetter = (code: number): boolean => code === 105 || code === 98 || code === 117 || code === 73 || code === 66 || code === 85;

function styleTagEnd(text: string, at: number): number {
  const slash = text.charCodeAt(at + 1) === 47 ? 1 : 0;
  return isStyleLetter(text.charCodeAt(at + 1 + slash)) && text.charCodeAt(at + 2 + slash) === 62 ? at + 3 + slash : -1;
}

function endsStyleTag(text: string, closeAt: number): boolean {
  if (!isStyleLetter(text.charCodeAt(closeAt - 1))) return false;
  const before = text.charCodeAt(closeAt - 2);
  return before === 60 || (before === 47 && text.charCodeAt(closeAt - 3) === 60);
}

const opensTag = (text: string, at: number): boolean =>
  isAsciiLetter(text.charCodeAt(at + 1 + (text.charCodeAt(at + 1) === 47 ? 1 : 0)));

function tagEnd(text: string, at: number, keepStyle: boolean): number {
  let close = text.indexOf(">", at + 1);
  while (keepStyle && close !== -1 && endsStyleTag(text, close)) close = text.indexOf(">", close + 1);
  return close === -1 ? -1 : close + 1;
}

function overrideEnd(text: string, at: number): number {
  const close = text.indexOf("}", at + 1);
  return close === -1 ? -1 : close + 1;
}

function markerEnd(text: string, at: number): number {
  MARKER_BODY_PATTERN.lastIndex = at + 1;
  return MARKER_BODY_PATTERN.test(text) ? MARKER_BODY_PATTERN.lastIndex : -1;
}

export function removeMarkup(text: string, { tags = false, overrides, markers = false, keepStyle = false }: MarkupRemoval): string {
  const scanner = markers ? MARKUP_OR_MARKER_START_PATTERN : MARKUP_START_PATTERN;
  let tagsExhausted = !tags;
  let overridesExhausted = !overrides;
  let markersExhausted = !markers;
  let result = "";
  let copied = 0;
  scanner.lastIndex = 0;
  for (let start = scanner.exec(text); start; start = scanner.exec(text)) {
    const at = start.index;
    const kind = text.charCodeAt(at);
    let end = -1;
    if (kind === 60) {
      const styleEnd = keepStyle ? styleTagEnd(text, at) : -1;
      if (styleEnd !== -1) {
        result += text.slice(copied, at) + text.slice(at, styleEnd).toLowerCase();
        copied = styleEnd;
        scanner.lastIndex = styleEnd;
        continue;
      }
      if (!tagsExhausted && opensTag(text, at)) {
        end = tagEnd(text, at, keepStyle);
        tagsExhausted = end === -1;
      }
    } else if (kind === 123) {
      if (!overridesExhausted && (overrides === "any" || text.charCodeAt(at + 1) === 92)) {
        end = overrideEnd(text, at);
        overridesExhausted = end === -1;
      }
    } else if (!markersExhausted) {
      end = markerEnd(text, at);
    }
    if (end === -1) continue;
    result += text.slice(copied, at);
    copied = end;
    scanner.lastIndex = end;
  }
  return copied === 0 ? text : result + text.slice(copied);
}

export function stripStyling(text: string): string {
  if (text.includes("{\\")) text = removeMarkup(text, { overrides: "ass" });
  return text.includes("<") ? text.replace(STYLE_TAG_PATTERN, "") : text;
}

export const collapseAdjacentStyleWraps = (text: string): string => (text.includes("</") ? text.replace(ADJACENT_STYLE_WRAP_PATTERN, "$2") : text);
