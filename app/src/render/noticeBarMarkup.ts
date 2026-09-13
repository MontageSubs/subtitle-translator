import { escapeHtml } from "../utils/escapeHtml";
import { CLOSE_ICON } from "./icons";

export type NoticeTone = "info" | "warning" | "critical";

export interface NoticeItem {
  tone: NoticeTone;
  text: string;
}

export interface NoticeBarOptions {
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

export function renderNoticeBar(options: NoticeBarOptions): string {
  const { id, variant, items, batchId, linkHref, linkLabel, linkExternal, dismissLabel, ariaLabel } = options;
  if (!items.length) return "";
  const showSwatch = items.length > 1;
  const renderItem = (item: NoticeItem) => `
    <span class="notice-bar__item">
      ${showSwatch ? `<span class="notice-bar__swatch notice-bar__swatch--${item.tone}"></span>` : ""}
      <span class="notice-bar__text notice-bar__text--${item.tone}">${escapeHtml(item.text)}</span>
    </span>
  `;
  const doubled = items.concat(items).map(renderItem).join("");
  const linkAttrs = linkExternal ? ` target="_blank" rel="noopener"` : "";
  return `
    <div class="notice-bar notice-bar--${variant}" id="${id}" data-batch-id="${escapeHtml(batchId)}" role="note"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}>
      <div class="notice-bar__track">
        <div class="notice-bar__scroll">${doubled}</div>
      </div>
      <a class="notice-bar__link" href="${linkHref}"${linkAttrs}>${escapeHtml(linkLabel)}</a>
      <button type="button" class="notice-bar__dismiss" data-notice-dismiss aria-label="${escapeHtml(dismissLabel)}">${CLOSE_ICON}</button>
    </div>
  `;
}
