import { escapeHtml } from "../utils/escapeHtml";
import { CLOSE_ICON } from "./icons";

export const NOTICE_BANNER_ID = "site-announcement";

export type NoticeTone = "info" | "warning" | "critical";

export interface NoticeItem {
  tone: NoticeTone;
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
  ariaLabel?: string;
}

function renderItem({ tone, text, href, label, external }: NoticeItem): string {
  const linkAttrs = external ? ` target="_blank" rel="noopener"` : "";
  return `
    <span class="notice-banner__item">
      <span class="notice-banner__swatch notice-banner__swatch--${tone}"></span>
      <a class="notice-banner__text notice-banner__text--${tone}" href="${href}" title="${escapeHtml(text)}" aria-label="${escapeHtml(`${text} — ${label}`)}"${linkAttrs}>${escapeHtml(text)}</a>
    </span>
  `;
}

export function renderNoticeBanner({ id, items, batchId, dismissLabel, ariaLabel }: NoticeBannerOptions): string {
  if (!items.length) return "";
  const divider = `<span class="notice-banner__divider" aria-hidden="true">·</span>`;
  const group = items.map(renderItem).join(divider);
  return `
    <div class="notice-banner" id="${id}" data-batch-id="${escapeHtml(batchId)}" role="note"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}>
      <div class="notice-banner__track" data-marquee>
        <span class="notice-banner__line"><span class="notice-banner__group">${group}</span></span>
      </div>
      <button type="button" class="icon-btn icon-btn--sm notice-banner__dismiss" data-notice-dismiss aria-label="${escapeHtml(dismissLabel)}">${CLOSE_ICON}</button>
    </div>
  `;
}
