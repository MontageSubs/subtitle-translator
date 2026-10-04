import { ComponentStatus } from "../../types";
import { FeedItem, fetchFeedItems, isStaleItem } from "./feed";

const DEEPL_STATUS_FEED_URL = "https://status.deepl.com/rss";
const AFFECTED_SERVICES_PATTERN = /(?:Affected Services|Services Affected)\s*:\s*(?:<\/[^>]+>)?\s*([^<\n\r]+)/i;
const API_SERVICE_PATTERN = /\b(?:DeepL (?:Pro|Free) - )?(?:API|Translate)\b/i;
const API_MENTION_PATTERN = /\b(?:deepl\s*api|translation\s*api|api\s*\(eu\)|api\s*\(us\)|api\s*\(jp\))\b/i;
const RESOLVED_TITLE_PATTERN = /\b(?:resolved|operating normally|fixed|restored|mitigated|closed)\b/i;
const RESOLVED_BODY_PATTERN =
  /\b(?:(?:issue|incident|service|services|traffic)?\s*(?:has been|is|was|were|are)?\s*(?:resolved|operating normally|fixed|restored|mitigated|closed)|fix was applied|operating normally again|restored correct routing)\b/i;
const MAJOR_PATTERN = /\b(?:major|outage|critical|down|unavailable|failures)\b/i;
const RESOLUTION_TAIL_CHARS = 350;

function isApiRelevant(item: FeedItem): boolean {
  const affectedServices = AFFECTED_SERVICES_PATTERN.exec(item.description)?.[1] ?? "";
  return API_SERVICE_PATTERN.test(affectedServices || item.title) || API_MENTION_PATTERN.test(`${item.title} ${item.description}`);
}

const stripTags = (text: string): string => String(text || "").replace(/<[^>]+>/g, " ");

export async function pollDeepLStatus(): Promise<ComponentStatus> {
  const items = await fetchFeedItems("DeepL", DEEPL_STATUS_FEED_URL);
  let status: ComponentStatus = "operational";

  for (const item of items ?? []) {
    if (isStaleItem(item) || !isApiRelevant(item)) continue;

    const cleanDescription = stripTags(item.description);
    const isResolved =
      RESOLVED_TITLE_PATTERN.test(item.title) || RESOLVED_BODY_PATTERN.test(cleanDescription.slice(-RESOLUTION_TAIL_CHARS));
    if (isResolved) continue;

    if (status !== "major_outage") {
      status = MAJOR_PATTERN.test(`${item.title} ${cleanDescription}`) ? "major_outage" : "degraded_performance";
    }
  }
  return status;
}
