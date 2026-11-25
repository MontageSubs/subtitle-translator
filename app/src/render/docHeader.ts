import type { DocAuthor, StaticPage } from "../types/docs";
import type { LocaleCode } from "../i18n/locales.config";
import { translate, translateHtml } from "../i18n/dictionaries";
import { markup } from "../i18n/markup";
import { REPO_URL } from "../config/social";
import { escapeHtml } from "../utils/escapeHtml";
import { formatDate } from "../utils/localeFormat";
import { renderAvatarStack } from "./avatarStack";
import { renderExternalLinkIcon } from "./icons";

const DATE_TIME_ZONE = "UTC";

function renderAuthors(locale: LocaleCode, authors: readonly DocAuthor[], basePath: string): string {
  if (!authors.length) return "";
  const names = authors.map((author) => escapeHtml(author.login)).join(", ");
  return `<a class="doc-byline__authors" href="${REPO_URL}/graphs/contributors" target="_blank" rel="noopener">${renderAvatarStack(authors, "lg", basePath, true)}<span class="doc-byline__names"><span class="sr-only">${translateHtml(locale, "docs.contributors")} </span>${names}</span>${renderExternalLinkIcon(translate(locale, "a11y.opensInNewTab"))}</a>`;
}

function renderDate(key: "docs.publishedOn" | "docs.updatedOn", value: string, locale: LocaleCode): string {
  const time = markup(`<time datetime="${escapeHtml(new Date(value).toISOString())}">${escapeHtml(formatDate(value, locale, DATE_TIME_ZONE))}</time>`);
  return `<span class="doc-byline__date">${translateHtml(locale, key, { date: time })}</span>`;
}

function renderDates(locale: LocaleCode, page: StaticPage): string {
  const published = page.createdAt ? formatDate(page.createdAt, locale, DATE_TIME_ZONE) : "";
  const updatedIsDistinct = page.updatedAt !== "" && formatDate(page.updatedAt, locale, DATE_TIME_ZONE) !== published;
  return [page.createdAt ? renderDate("docs.publishedOn", page.createdAt, locale) : "", updatedIsDistinct ? renderDate("docs.updatedOn", page.updatedAt, locale) : ""].join("");
}

export function renderDocHeader(locale: LocaleCode, page: StaticPage, basePath: string): string {
  const authors = renderAuthors(locale, page.authors, basePath);
  const dates = renderDates(locale, page);
  if (!authors && !dates) return page.heading;
  return `<header class="doc-detail__header">${page.heading}<div class="doc-byline">${authors}${dates ? `<span class="doc-byline__dates">${dates}</span>` : ""}</div></header>`;
}
