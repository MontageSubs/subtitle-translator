import { labelAttrs } from "../utils/labelAttrs";
import { escapeHtml } from "../utils/escapeHtml";
import type { BannerTone } from "../types/docs";
import { CLOSE_ICON, renderExternalLinkIcon } from "./icons";

export const NOTICE_BANNER_ID = "site-announcement";
export const NOTICE_DISMISS_KEY = "subtitle-translator:notice-dismissed-id";

export interface NoticeItem {
  tone: BannerTone;
  text: string;
  href: string;
  label: string;
  external?: boolean;
}

export interface NoticeBannerOptions {
  id: string;
  items: NoticeItem[];
  batchId: string;
  dismissLabel: string;
  newTabLabel: string;
  ariaLabel?: string;
}

function renderItem({ tone, text, href, label, external }: NoticeItem, newTabLabel: string): string {
  const linkAttrs = external ? ` target="_blank" rel="noopener"` : "";
  return `
    <span class="notice-banner__item">
      <span class="notice-banner__swatch notice-banner__swatch--${tone}"></span>
      <a class="notice-banner__text notice-banner__text--${tone}" href="${href}" title="${escapeHtml(text)}" aria-label="${escapeHtml(`${text}: ${label}`)}"${linkAttrs}>${escapeHtml(text)}${external ? renderExternalLinkIcon(newTabLabel) : ""}</a>
    </span>
  `;
}

export function renderNoticeBanner({ id, items, batchId, dismissLabel, newTabLabel, ariaLabel }: NoticeBannerOptions): string {
  if (!items.length) return "";
  const group = items.map((item) => renderItem(item, newTabLabel)).join("");
  return `
    <div class="notice-banner" id="${id}" data-batch-id="${escapeHtml(batchId)}" role="note"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}>
      <div class="notice-banner__track" data-marquee>
        <span class="notice-banner__line"><span class="notice-banner__group">${group}</span></span>
      </div>
      <button type="button" class="icon-btn icon-btn--sm notice-banner__dismiss" data-notice-dismiss data-requires-js ${labelAttrs(dismissLabel)}>${CLOSE_ICON}</button>
    </div>
  `;
}
