import { ComponentStatus } from "../../types";
import { FeedItem, fetchFeedItems, isStaleItem } from "./feed";
import { stripTags } from "./markup";

const DEEPL_STATUS_FEED_URL = "https://status.deepl.com/rss";
const ACTIVE_INCIDENT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const AFFECTED_SERVICES_PATTERN = /(?:Affected Services|Services Affected)\s*:\s*(?:<\/[^>]+>)?\s*([^<\n\r]+)/i;
const API_SERVICE_PATTERN = /\bAPI\b/i;
const API_MENTION_PATTERN = /\b(?:deepl\s*api|translation\s*api|api\s*\((?:eu|us|jp)\))\b/i;
const UNAFFECTED_SENTENCE_PATTERN = /\b(?:not|never|no longer)\s+(?:been\s+)?(?:affected|impacted)\b|\bunaffected\b/i;
const UPDATE_MARKER_PATTERN = /\b\d{2}:\d{2}:\d{2}:\s/;
const RESOLVED_PATTERN =
  /\b(?:resolved|restored|fixed|mitigated|closed|operating normally|back to normal|normal again|no longer|fix (?:has been|was) (?:applied|deployed)|should now be able)\b/i;
const MAJOR_PATTERN = /\b(?:major|outage|critical|down|unavailable|not available|unable)\b/i;
const MAINTENANCE_CATEGORY = "maintenance";

const latestUpdateOf = (plainText: string): string => plainText.split(UPDATE_MARKER_PATTERN).pop()?.trim() ?? plainText;

const withoutUnaffectedSentences = (text: string): string =>
  text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !UNAFFECTED_SENTENCE_PATTERN.test(sentence))
    .join(" ");

function isApiRelevant(item: FeedItem, plainText: string): boolean {
  const affectedServices = AFFECTED_SERVICES_PATTERN.exec(item.description)?.[1];
  if (affectedServices) return API_SERVICE_PATTERN.test(affectedServices);
  return API_MENTION_PATTERN.test(withoutUnaffectedSentences(`${item.title}. ${plainText}`));
}

export async function pollDeepLStatus(): Promise<ComponentStatus> {
  const items = await fetchFeedItems("DeepL", DEEPL_STATUS_FEED_URL);
  let status: ComponentStatus = "operational";

  for (const item of items ?? []) {
    if (isStaleItem(item, ACTIVE_INCIDENT_MAX_AGE_MS) || item.category?.toLowerCase() === MAINTENANCE_CATEGORY) continue;

    const plainText = stripTags(item.description, " ");
    if (!isApiRelevant(item, plainText)) continue;

    const latestUpdate = latestUpdateOf(plainText);
    if (RESOLVED_PATTERN.test(item.title) || RESOLVED_PATTERN.test(latestUpdate)) continue;

    if (status !== "major_outage") {
      status = MAJOR_PATTERN.test(`${item.title} ${latestUpdate}`) ? "major_outage" : "degraded_performance";
    }
  }
  return status;
}
