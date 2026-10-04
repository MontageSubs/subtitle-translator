import { logUpstreamParseError } from "../../logger";
import { fetchText } from "./fetch";

const STALE_ITEM_MS = 72 * 60 * 60 * 1000;

export interface FeedItem {
  title: string;
  description: string;
  pubDate?: string;
  link?: string;
  guid?: string;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function readTag(block: string, tag: string): string {
  const pattern = new RegExp(
    `<(?:[a-zA-Z0-9_-]+:)?${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/(?:[a-zA-Z0-9_-]+:)?${tag}>`,
    "i",
  );
  const match = pattern.exec(block);
  return match ? match[1].trim() : "";
}

function extractFeedItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const entryPattern = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;

  let match: RegExpExecArray | null;
  while ((match = entryPattern.exec(xml)) !== null) {
    const block = match[1];
    const link = readTag(block, "link") || readTag(block, "id");
    const guid = readTag(block, "guid") || link;
    items.push({
      title: decodeXmlEntities(readTag(block, "title")).replace(/<[^>]+>/g, "").trim(),
      description: decodeXmlEntities(readTag(block, "description") || readTag(block, "content") || readTag(block, "summary")),
      pubDate: readTag(block, "pubDate") || readTag(block, "updated"),
      link: link || undefined,
      guid: guid || undefined,
    });
  }
  return items;
}

export function isStaleItem(item: FeedItem): boolean {
  if (!item.pubDate) return false;
  const publishedAt = new Date(item.pubDate).getTime();
  return !isNaN(publishedAt) && Date.now() - publishedAt > STALE_ITEM_MS;
}

export async function fetchFeedItems(serviceName: string, url: string): Promise<FeedItem[] | null> {
  const xml = await fetchText(serviceName, url);
  if (!xml) return null;

  const items = extractFeedItems(xml);
  if (items.length === 0 && !/<(?:channel|feed)[\s>]/i.test(xml)) {
    logUpstreamParseError(serviceName, url, "Invalid or empty RSS feed", xml.slice(0, 300));
    return null;
  }
  return items;
}
