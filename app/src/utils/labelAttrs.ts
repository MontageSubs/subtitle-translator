import { escapeHtml } from "./escapeHtml";

export function tipAttr(text: string): string {
  return `title="${escapeHtml(text)}"`;
}

export function labelAttrs(text: string): string {
  return `aria-label="${escapeHtml(text)}" ${tipAttr(text)}`;
}
