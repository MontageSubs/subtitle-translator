import { escapeHtml } from "../utils/escapeHtml";

export class Markup {
  constructor(readonly html: string) {}

  toString(): string {
    return this.html;
  }
}

export const markup = (html: string): Markup => new Markup(html);

export const escapedParam = (value: string | number | Markup): string => (value instanceof Markup ? value.html : escapeHtml(String(value)));
