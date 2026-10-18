import { LocaleCode } from "../i18n/locales.config";
import { translate } from "../i18n/dictionaries";
import { renderEditIcon, renderExternalLinkIcon } from "./icons";
import { StaticPage } from "../types/docs";

export function renderDocHeader(locale: LocaleCode, page: StaticPage): string {
  return `<header class="doc-detail__header">${page.heading}<span class="doc-detail__contribute" data-nosnippet><a class="action-pill" href="${page.sourceUrl}" target="_blank" rel="nofollow noopener noreferrer" title="${translate(locale, "tip.improvePage")}">${renderEditIcon(14)}<span>${translate(locale, "docs.improvePage")}</span>${renderExternalLinkIcon(translate(locale, "a11y.opensInNewTab"))}</a></span></header>`;
}
