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

const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7a3\uff00-\uffef]/;
const SCROLL_WEIGHT_THRESHOLD = 34;
const SCROLL_WEIGHT_PER_SEC = 3.2;

function weightedLength(text: string): number {
  let weight = 0;
  for (const ch of text) weight += CJK_PATTERN.test(ch) ? 1.8 : 1;
  return weight;
}

function totalWeightedLength(items: NoticeItem[]): number {
  return items.reduce((sum, item) => sum + weightedLength(item.text), 0);
}

export function renderNoticeBanner(options: NoticeBannerOptions): string {
  const { id, variant, items, batchId, linkHref, linkLabel, linkExternal, dismissLabel, ariaLabel } = options;
  if (!items.length) return "";
  const showSwatch = items.length > 1;
  const renderItem = (item: NoticeItem) => `
    <span class="notice-banner__item">
      ${showSwatch ? `<span class="notice-banner__swatch notice-banner__swatch--${item.tone}"></span>` : ""}
      <span class="notice-banner__text notice-banner__text--${item.tone}">${escapeHtml(item.text)}</span>
    </span>
  `;
  const totalWeight = totalWeightedLength(items);
  const scrolling = totalWeight > SCROLL_WEIGHT_THRESHOLD;
  const renderedItems = (scrolling ? items.concat(items) : items).map(renderItem).join("");
  const durationSec = Math.max(10, Math.round(totalWeight / SCROLL_WEIGHT_PER_SEC));
  const scrollStyle = scrolling ? ` style="animation-duration:${durationSec}s"` : "";
  const scrollClass = scrolling ? "" : " notice-banner__scroll--static";
  const linkAttrs = linkExternal ? ` target="_blank" rel="noopener"` : "";
  return `
    <div class="notice-banner notice-banner--${variant}" id="${id}" data-batch-id="${escapeHtml(batchId)}" role="note"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}>
      <div class="notice-banner__track">
        <div class="notice-banner__scroll${scrollClass}"${scrollStyle}>${renderedItems}</div>
      </div>
      <a class="notice-banner__link" href="${linkHref}"${linkAttrs}>${escapeHtml(linkLabel)}</a>
      <button type="button" class="notice-banner__dismiss" data-notice-dismiss aria-label="${escapeHtml(dismissLabel)}">${CLOSE_ICON}</button>
    </div>
  `;
}
