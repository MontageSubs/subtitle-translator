import { escapeHtml } from "../utils/escapeHtml";
import { CLOSE_ICON } from "./icons";

export type NoticeTone = "info" | "warning" | "critical";

export interface NoticeItem {
  tone: NoticeTone;
  text: string;
}

export interface NoticeBannerOptions {
  id: string;
  variant: "status" | "announcement";
  items: NoticeItem[];
  batchId: string;
  linkHref: string;
  linkLabel: string;
  linkExternal?: boolean;
  dismissLabel: string;
  ariaLabel?: string;
}

function renderItem(item: NoticeItem, options: NoticeBannerOptions): string {
  const { linkHref, linkLabel, linkExternal } = options;
  const linkAttrs = linkExternal ? ` target="_blank" rel="noopener"` : "";
  return `
    <span class="notice-banner__item">
      <span class="notice-banner__swatch notice-banner__swatch--${item.tone}"></span>
      <a class="notice-banner__text notice-banner__text--${item.tone}" href="${linkHref}" title="${escapeHtml(item.text)}"${linkAttrs}>${escapeHtml(item.text)}<span class="sr-only"> — ${escapeHtml(linkLabel)}</span></a>
    </span>
  `;
}

export function renderNoticeBanner(options: NoticeBannerOptions): string {
  const { id, variant, items, batchId, dismissLabel, ariaLabel } = options;
  if (!items.length) return "";
  const divider = `<span class="notice-banner__divider" aria-hidden="true">·</span>`;
  const group = items.map((item) => renderItem(item, options)).join(divider);
  return `
    <div class="notice-banner notice-banner--${variant}" id="${id}" data-batch-id="${escapeHtml(batchId)}" role="note"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}>
      <div class="notice-banner__track" data-marquee>
        <span class="notice-banner__line"><span class="notice-banner__group">${group}</span></span>
      </div>
      <button type="button" class="icon-btn icon-btn--sm notice-banner__dismiss" data-notice-dismiss aria-label="${escapeHtml(dismissLabel)}">${CLOSE_ICON}</button>
    </div>
  `;
}
