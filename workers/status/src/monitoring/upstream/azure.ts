import { ComponentStatus } from "../../types";
import { fetchFeedItems, isStaleItem } from "./feed";

const AZURE_STATUS_FEED_URL = "https://azurestatuscdn.azureedge.net/en-us/status/feed/";
const AZURE_MAJOR_KEYWORDS = ["outage", "unavailable", "down", "unable to access"];
const AZURE_TRANSLATOR_PATTERN = /\b(?:azure\s*ai\s*translator|ai\s*translator|translator|translation|translate)\b/i;
const AZURE_RESOLVED_PATTERN = /\b(?:resolved|restored|mitigated|completed|operating normally)\b/i;
const RESOLUTION_TAIL_CHARS = 300;

export interface AzureIncident {
  id: string;
  title: string;
  severity: string;
  url: string;
}

export interface AzureStatusSummary {
  translatorStatus: ComponentStatus;
  infraStatus: ComponentStatus;
  activeIncidents?: AzureIncident[];
}

export async function pollAzureStatus(): Promise<AzureStatusSummary> {
  const items = await fetchFeedItems("Azure", AZURE_STATUS_FEED_URL);
  let translatorStatus: ComponentStatus = "operational";
  const activeIncidents: AzureIncident[] = [];

  for (const item of items ?? []) {
    if (isStaleItem(item)) continue;

    const combinedText = `${item.title} ${item.description}`;
    if (!AZURE_TRANSLATOR_PATTERN.test(combinedText)) continue;

    const haystack = combinedText.toLowerCase();
    if (AZURE_RESOLVED_PATTERN.test(item.title) || AZURE_RESOLVED_PATTERN.test(haystack.slice(-RESOLUTION_TAIL_CHARS))) continue;

    const isMajor = AZURE_MAJOR_KEYWORDS.some((keyword) => haystack.includes(keyword));
    activeIncidents.push({
      id: item.guid || item.link || "",
      title: item.title || "Azure AI Translator Advisory",
      severity: isMajor ? "high" : "medium",
      url: item.link || "https://status.azure.com/status",
    });

    if (isMajor) translatorStatus = "major_outage";
    else if (translatorStatus !== "major_outage") translatorStatus = "degraded_performance";
  }

  return { translatorStatus, infraStatus: translatorStatus, activeIncidents };
}
