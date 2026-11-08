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

export interface ExternalLinkOptions {
  className?: string;
  text?: string;
  leadingIcon?: string;
}

export function externalLink(href: string, label: string, options: ExternalLinkOptions = {}): string {
  const { className, text = label, leadingIcon = "" } = options;
  const classAttr = className ? ` class="${className}"` : "";
  return `<a${classAttr} href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)} (opens in a new tab)">${leadingIcon}${escapeHtml(text)}${EXTERNAL_LINK_ICON}</a>`;
}

const footerIcon = (shapes: string): string =>
  `<svg class="icon-sub" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`;

export const CODE_ICON = footerIcon(`<polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>`);

export const BADGES_ICON = footerIcon(
  `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>`,
);

export const GITHUB_ICON = footerIcon(
  `<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>`,
);

export const jsonLdScript = (data: unknown): string =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
