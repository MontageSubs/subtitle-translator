import { LocaleCode } from "../i18n/locales.config";
import { translate } from "../i18n/dictionaries";
import { renderEditIcon } from "./icons";
import { StaticPage } from "../types/docs";

export function renderDocHeader(locale: LocaleCode, page: StaticPage): string {
  return `<header class="doc-detail__header">${page.heading}<span class="doc-detail__contribute" data-nosnippet><a class="action-pill" href="${page.sourceUrl}" target="_blank" rel="nofollow noopener noreferrer">${renderEditIcon(14)}<span>${translate(locale, "docs.improvePage")}</span><span class="sr-only"> ${translate(locale, "docs.opensInNewTab")}</span></a></span></header>`;
}
