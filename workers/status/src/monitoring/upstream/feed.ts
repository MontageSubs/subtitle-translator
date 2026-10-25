import { logUpstreamParseError } from "../../logger";
import { fetchText } from "./fetch";
import { stripTags } from "./markup";
import { decodeXmlEntities, readTag } from "./xmlText";

const STALE_ITEM_MS = 72 * 60 * 60 * 1000;

export interface FeedItem {
  title: string;
  description: string;
  pubDate?: string;
  link?: string;
  guid?: string;
  category?: string;
}

const ENTRY_OPEN_PATTERN = /<(?:item|entry)[\s>]/gi;
const ENTRY_CLOSE_PATTERN = /<\/(?:item|entry)>/gi;

function* entryBlocks(xml: string): Generator<string> {
  ENTRY_OPEN_PATTERN.lastIndex = 0;
  for (let open = ENTRY_OPEN_PATTERN.exec(xml); open; open = ENTRY_OPEN_PATTERN.exec(xml)) {
    ENTRY_CLOSE_PATTERN.lastIndex = ENTRY_OPEN_PATTERN.lastIndex;
    const close = ENTRY_CLOSE_PATTERN.exec(xml);
    if (!close) return;
    yield xml.slice(ENTRY_OPEN_PATTERN.lastIndex, close.index);
    ENTRY_OPEN_PATTERN.lastIndex = ENTRY_CLOSE_PATTERN.lastIndex;
  }
}

function extractFeedItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const block of entryBlocks(xml)) {
    const link = readTag(block, "link") || readTag(block, "id");
    const guid = readTag(block, "guid") || link;
    items.push({
      title: stripTags(decodeXmlEntities(readTag(block, "title")), "").trim(),
      description: decodeXmlEntities(readTag(block, "description") || readTag(block, "content") || readTag(block, "summary")),
      pubDate: readTag(block, "pubDate") || readTag(block, "updated"),
      link: link || undefined,
      guid: guid || undefined,
      category: readTag(block, "category") || undefined,
    });
  }
  return items;
}

const incidentKeyOf = (item: FeedItem): string => (item.guid || item.link || item.title).split("#")[0];

const publishedAtOf = (item: FeedItem): number => Date.parse(item.pubDate ?? "") || 0;

export function latestPerIncident(items: FeedItem[]): FeedItem[] {
  const latest = new Map<string, FeedItem>();
  for (const item of items) {
    const key = incidentKeyOf(item);
    const current = latest.get(key);
    if (!current || publishedAtOf(item) > publishedAtOf(current)) latest.set(key, item);
  }
  return [...latest.values()];
}

export function isStaleItem(item: FeedItem, maxAgeMs: number = STALE_ITEM_MS): boolean {
  if (!item.pubDate) return false;
  const publishedAt = new Date(item.pubDate).getTime();
  return !isNaN(publishedAt) && Date.now() - publishedAt > maxAgeMs;
}

export async function fetchFeedItems(serviceName: string, url: string): Promise<FeedItem[] | null> {
  const xml = await fetchText(serviceName, url);
  if (!xml) return null;

  const items = extractFeedItems(xml);
  if (items.length === 0 && !/<(?:channel|feed)[\s>]/i.test(xml)) {
    logUpstreamParseError(serviceName, url, "Invalid or empty RSS feed", xml.slice(0, 300));
    return null;
  }
  return latestPerIncident(items);
}
