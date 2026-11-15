import { escapeHtml } from "../utils/escapeHtml";

export class Markup {
  constructor(readonly html: string) {}

  toString(): string {
    return this.html;
  }
}

export const markup = (html: string): Markup => new Markup(html);

const TAG_PATTERN = /<\/?[a-z][^>]*>/i;

function warnUnwrappedTags(value: string): void {
  if (import.meta.env?.DEV && TAG_PATTERN.test(value)) console.error(`i18n parameter contains HTML and will be shown as text; wrap it with markup(): ${value}`);
}

export function escapedParam(value: string | number | Markup): string {
  if (value instanceof Markup) return value.html;
  const text = String(value);
  warnUnwrappedTags(text);
  return escapeHtml(text);
}
