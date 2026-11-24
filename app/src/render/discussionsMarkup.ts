import { renderExternalLinkIcon } from "./icons";
import { DISCUSSIONS_URL } from "../config/social";
import { translate, translateHtml } from "../i18n/dictionaries";
import type { LocaleCode } from "../i18n/locales.config";

interface DiscussionsFallbackOptions {
  locale: LocaleCode;
  communityHref: string;
  messageKey: "discussions.fallback.desc" | "discussions.nojs.desc";
  retryable: boolean;
}

export function renderNewTabLink(href: string, label: string, newTabLabel: string, className = ""): string {
  const classAttribute = className ? ` class="${className}"` : "";
  return `<a${classAttribute} href="${href}" target="_blank" rel="noopener">${label}${renderExternalLinkIcon(newTabLabel)}</a>`;
}

export function renderDiscussionsFallback({ locale, communityHref, messageKey, retryable }: DiscussionsFallbackOptions): string {
  const newTabLabel = translate(locale, "a11y.opensInNewTab");
  const retryButton = retryable ? `<button type="button" class="secondary" id="discussions-retry-btn">${translateHtml(locale, "discussions.retry")}</button>` : "";
  return `<div class="discussions-fallback">
      <p class="discussions-fallback__desc">${translateHtml(locale, messageKey)}</p>
      <div class="discussions-fallback__actions">
        ${renderNewTabLink(DISCUSSIONS_URL, translateHtml(locale, "discussions.fallback.action"), newTabLabel, "secondary")}
        ${renderNewTabLink(communityHref, translateHtml(locale, "discussions.community.link"), newTabLabel, "secondary")}
        ${retryButton}
      </div>
    </div>`;
}
