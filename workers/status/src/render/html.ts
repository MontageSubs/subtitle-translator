export function escapeHtml(text?: string): string {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const EXTERNAL_LINK_ICON =
  `<svg viewBox="0 0 24 24" width="0.7em" height="0.7em" aria-hidden="true" focusable="false" style="margin-left:0.25em;vertical-align:-0.05em"><path fill="currentColor" d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h5v2H7v10h10v-3h2v5H5V5z"/></svg>`;
