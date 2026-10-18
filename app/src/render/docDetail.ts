import { LocaleCode } from "../i18n/locales.config";
import { translate } from "../i18n/dictionaries";
import { StaticPage } from "../types/docs";
import { languageName } from "../utils/languageNames";
import { renderEditIcon, renderExternalLinkIcon } from "./icons";

interface DocDetailParts {
  backLink?: string;
  footer?: string;
}

function renderFallbackNotice(locale: LocaleCode, page: StaticPage): string {
  if (!page.isFallback) return "";
  return `<p class="doc-detail__fallback-notice">${translate(locale, "docs.fallbackNotice", { locale: languageName(page.sourceLocale, locale) })}</p>`;
}

function renderEditLink(locale: LocaleCode, page: StaticPage): string {
  return `<div class="doc-detail__tools" data-nosnippet><a class="secondary" href="${page.sourceUrl}" target="_blank" rel="nofollow noopener noreferrer" title="${translate(locale, "tip.improvePage")}">${renderEditIcon(14)}<span>${translate(locale, "docs.improvePage")}</span>${renderExternalLinkIcon(translate(locale, "a11y.opensInNewTab"))}</a></div>`;
}

export function renderDocDetail(locale: LocaleCode, page: StaticPage, { backLink = "", footer = "" }: DocDetailParts = {}): string {
  const lead = backLink ? "back" : page.isFallback ? "notice" : "heading";
  return `
    <section class="step doc-detail doc-detail--lead-${lead}">
      ${backLink}${renderEditLink(locale, page)}
      ${renderFallbackNotice(locale, page)}
      <article class="doc-detail__body">${page.heading}${page.html}</article>
      ${footer}
    </section>
  `;
}
