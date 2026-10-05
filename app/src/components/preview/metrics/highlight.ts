import { escapeHtml } from "../../../utils/escapeHtml";

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

export function highlightText(text: string, needle: string): string {
  const safe = escapeHtml(text);
  if (!needle) return safe;
  const pattern = new RegExp(escapeHtml(needle).replace(REGEX_SPECIALS, "\\$&"), "gi");
  return safe.replace(pattern, (match) => `<mark class="preview-search-highlight">${match}</mark>`);
}
