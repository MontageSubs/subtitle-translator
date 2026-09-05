import { ComponentStatus } from "./types";
import { logUpstreamPollError, logUpstreamParseError } from "./logger";

const FETCH_TIMEOUT_MS = 5000;

async function fetchJsonWithDiagnostics<T>(
  serviceName: string,
  url: string,
  timeoutMs: number = FETCH_TIMEOUT_MS,
  retries = 2,
): Promise<T | null> {
  let lastError = "";
  let lastStatus = 0;
  let lastSnippet = "";

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "MontageSubs-Status-Probe/1.0",
          Accept: "application/json",
        },
      });

      lastStatus = response.status;
      if (response.ok) {
        const rawText = await response.text();
        try {
          return JSON.parse(rawText) as T;
        } catch (jsonErr) {
          logUpstreamParseError(
            serviceName,
            url,
            `JSON parse failed: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`,
            rawText.slice(0, 300),
          );
          return null;
        }
      }

      lastSnippet = await response.text().catch(() => "");
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastError = isAbort ? "Request timed out" : err instanceof Error ? err.message : String(err);
      lastStatus = 0;
    } finally {
      clearTimeout(timer);
    }
  }

  logUpstreamPollError(serviceName, url, lastStatus, lastError, lastSnippet || undefined);
  return null;
}

async function fetchTextWithDiagnostics(
  serviceName: string,
  url: string,
  acceptHeader: string = "application/rss+xml, text/xml, */*",
  timeoutMs: number = FETCH_TIMEOUT_MS,
  retries = 2,
): Promise<string | null> {
  let lastError = "";
  let lastStatus = 0;
  let lastSnippet = "";

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "MontageSubs-Status-Probe/1.0",
          Accept: acceptHeader,
        },
      });

      lastStatus = response.status;
      if (response.ok) {
        return await response.text();
      }

      lastSnippet = await response.text().catch(() => "");
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastError = isAbort ? "Request timed out" : err instanceof Error ? err.message : String(err);
      lastStatus = 0;
    } finally {
      clearTimeout(timer);
    }
  }

  logUpstreamPollError(serviceName, url, lastStatus, lastError, lastSnippet || undefined);
  return null;
}

export interface GitHubStatusSummary {
  pageStatus: ComponentStatus;
  actionsStatus: ComponentStatus;
  platformIndicator: "none" | "minor" | "major" | "critical";
  description: string;
}

export async function pollGitHubStatus(): Promise<GitHubStatusSummary> {
  const url = "https://www.githubstatus.com/api/v2/summary.json";
  const data = await fetchJsonWithDiagnostics<any>("GitHub", url);
  if (!data) {
    return {
      pageStatus: "operational",
      actionsStatus: "operational",
      platformIndicator: "none",
      description: "GitHub status feed unreachable, assuming nominal",
    };
  }

  if (typeof data !== "object" || !data.status) {
    logUpstreamParseError(
      "GitHub",
      url,
      "Response missing status object",
      JSON.stringify(data).slice(0, 300),
    );
    return {
      pageStatus: "operational",
      actionsStatus: "operational",
      platformIndicator: "none",
      description: "GitHub status format unrecognized, assuming nominal",
    };
  }

  const indicator = (data.status?.indicator || "none") as
    "none" | "minor" | "major" | "critical";
  const components = Array.isArray(data.components) ? data.components : [];

  const pagesComp = components.find(
    (c: any) =>
      typeof c.name === "string" && c.name.toLowerCase().includes("pages"),
  );
  const actionsComp = components.find(
    (c: any) =>
      typeof c.name === "string" && c.name.toLowerCase().includes("actions"),
  );

  const mapStatus = (rawStatus?: string): ComponentStatus => {
    if (!rawStatus) return "operational";
    const s = rawStatus.toLowerCase();
    if (s === "operational") return "operational";
    if (s === "degraded_performance") return "degraded_performance";
    if (s === "partial_outage") return "partial_outage";
    if (s === "major_outage") return "major_outage";
    return "operational";
  };

  return {
    pageStatus: mapStatus(pagesComp?.status),
    actionsStatus: mapStatus(actionsComp?.status),
    platformIndicator: indicator,
    description: data.status?.description || "All Systems Operational",
  };
}

export async function pollCloudflareStatus(): Promise<ComponentStatus> {
  const url = "https://www.cloudflarestatus.com/api/v2/summary.json";
  const data = await fetchJsonWithDiagnostics<any>("Cloudflare", url);
  if (!data) {
    return "operational";
  }

  if (typeof data !== "object" || !data.status) {
    logUpstreamParseError(
      "Cloudflare",
      url,
      "Response missing status object",
      JSON.stringify(data).slice(0, 300),
    );
    return "operational";
  }

  const indicator = data.status?.indicator;
  const components = Array.isArray(data.components) ? data.components : [];
  const coreComps = components.filter((c: any) => {
    if (typeof c.name !== "string") return false;
    const name = c.name.toLowerCase();
    return (
      name === "workers" ||
      name === "pages" ||
      name === "network" ||
      name.includes("cloudflare network")
    );
  });

  let status: ComponentStatus = "operational";
  for (const comp of coreComps) {
    const s = String(comp.status || "").toLowerCase();
    if (s === "major_outage") {
      status = "major_outage";
      break;
    }
    if (s === "partial_outage" || s === "degraded_performance") {
      status = "degraded_performance";
    }
  }

  if (status === "operational") {
    if (indicator === "major" || indicator === "critical") {
      return "major_outage";
    }
    if (indicator === "minor" && coreComps.length === 0) {
      return "degraded_performance";
    }
  }

  return status;
}

export interface GoogleCloudIncidentsSummary {
  translationApiStatus: ComponentStatus;
  infraStatus: ComponentStatus;
  activeIncidents: Array<{
    id: string;
    title: string;
    severity: string;
    url: string;
  }>;
}

export async function pollGoogleCloudIncidents(): Promise<GoogleCloudIncidentsSummary> {
  const url = "https://status.cloud.google.com/incidents.json";
  const data = await fetchJsonWithDiagnostics<any[]>("GoogleCloud", url);
  if (!Array.isArray(data)) {
    if (data !== null) {
      logUpstreamParseError(
        "GoogleCloud",
        url,
        "Payload is not an array of incidents",
        JSON.stringify(data).slice(0, 300),
      );
    }
    return {
      translationApiStatus: "operational",
      infraStatus: "operational",
      activeIncidents: [],
    };
  }

  const activeIncidents = data.filter((item) => {
    if (!item) return false;
    if (item.end && String(item.end).trim() !== "") return false;
    if (item.most_recent_update?.status === "AVAILABLE") return false;
    return true;
  });

  let translationStatus: ComponentStatus = "operational";
  let infraStatus: ComponentStatus = "operational";
  const mappedIncidents: Array<{
    id: string;
    title: string;
    severity: string;
    url: string;
  }> = [];

  for (const inc of activeIncidents) {
    const serviceName = String(inc.service_name || "").toLowerCase();
    const externalDesc = String(inc.external_desc || "").toLowerCase();
    const severity = String(inc.severity || "").toLowerCase();

    const affectedTitles = Array.isArray(inc.affected_products)
      ? inc.affected_products
          .map((p: any) => `${p.title || ""} ${p.current_title || ""}`)
          .join(" ")
          .toLowerCase()
      : "";

    const combinedText = `${serviceName} ${externalDesc} ${affectedTitles}`;
    const isTranslation = /\b(?:translat(?:ion|e|or)?)\b/i.test(combinedText);
    const isGlobalInfra =
      inc.affects_all === true ||
      /\b(?:network(?:ing)?|compute|cloud\s*run)\b/i.test(combinedText);

    mappedIncidents.push({
      id: String(inc.id || inc.number || `gcp_${Date.now()}`),
      title: String(
        inc.external_desc || inc.service_name || "Google Cloud Advisory",
      ),
      severity: severity || "medium",
      url: inc.uri
        ? (String(inc.uri).startsWith("http")
            ? String(inc.uri)
            : `https://status.cloud.google.com${String(inc.uri).startsWith("/") ? inc.uri : `/${inc.uri}`}`)
        : "https://status.cloud.google.com",
    });

    const statusImpact = String(inc.status_impact || "").toUpperCase();
    const isMajorImpact =
      statusImpact === "SERVICE_OUTAGE" ||
      severity === "high" ||
      severity === "critical";

    if (isTranslation) {
      if (isMajorImpact) {
        translationStatus = "major_outage";
      } else if (translationStatus !== "major_outage") {
        translationStatus = "degraded_performance";
      }
    }

    if (isGlobalInfra) {
      if (isMajorImpact) {
        infraStatus = "major_outage";
      } else if (infraStatus !== "major_outage") {
        infraStatus = "degraded_performance";
      }
    }
  }

  return {
    translationApiStatus: translationStatus,
    infraStatus,
    activeIncidents: mappedIncidents,
  };
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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

function extractRssItems(
  xml: string,
): Array<{ title: string; description: string; pubDate?: string }> {
  const items: Array<{ title: string; description: string; pubDate?: string }> = [];
  const entryPattern = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  const findTag = (block: string, tag: string): string => {
    const regex = new RegExp(
      `<(?:[a-zA-Z0-9_-]+:)?${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/(?:[a-zA-Z0-9_-]+:)?${tag}>`,
      "i",
    );
    const m = regex.exec(block);
    return m ? m[1].trim() : "";
  };

  let match: RegExpExecArray | null;
  while ((match = entryPattern.exec(xml)) !== null) {
    const block = match[1];
    const rawTitle = findTag(block, "title");
    const rawDesc =
      findTag(block, "description") ||
      findTag(block, "content") ||
      findTag(block, "summary");
    const pubDate = findTag(block, "pubDate") || findTag(block, "updated");

    items.push({
      title: decodeXmlEntities(rawTitle).replace(/<[^>]+>/g, "").trim(),
      description: decodeXmlEntities(rawDesc),
      pubDate,
    });
  }
  return items;
}

const DEEPL_STATUS_FEED_URL = "https://status.deepl.com/rss";

export async function pollDeepLStatus(): Promise<ComponentStatus> {
  const xml = await fetchTextWithDiagnostics("DeepL", DEEPL_STATUS_FEED_URL);
  if (!xml) {
    return "operational";
  }

  const items = extractRssItems(xml);
  if (items.length === 0 && !xml.includes("<channel>") && !xml.includes("<feed>")) {
    logUpstreamParseError("DeepL", DEEPL_STATUS_FEED_URL, "Invalid or empty RSS feed", xml.slice(0, 300));
    return "operational";
  }

  let status: ComponentStatus = "operational";

  for (const item of items) {
    if (item.pubDate) {
      const pubTime = new Date(item.pubDate).getTime();
      if (!isNaN(pubTime) && Date.now() - pubTime > 72 * 60 * 60 * 1000) {
        continue;
      }
    }

    const serviceRegex =
      /(?:Affected Services|Services Affected)\s*:\s*(?:<\/[^>]+>)?\s*([^<\n\r]+)/i;
    const serviceMatch = serviceRegex.exec(item.description);
    const affectedServices = serviceMatch ? serviceMatch[1] : "";

    const isApiRelevant =
      /\b(?:DeepL (?:Pro|Free) - )?(?:API|Translate)\b/i.test(
        affectedServices || item.title,
      ) ||
      /\b(?:deepl\s*api|translation\s*api|api\s*\(eu\)|api\s*\(us\)|api\s*\(jp\))\b/i.test(
        `${item.title} ${item.description}`,
      );

    if (!isApiRelevant) {
      continue;
    }

    const cleanDesc = item.description.replace(/<[^>]+>/g, " ");
    const isResolved =
      /\b(?:resolved|operating normally|fixed|restored|mitigated|closed)\b/i.test(
        item.title,
      ) ||
      /\b(?:(?:issue|incident|service|services|traffic)?\s*(?:has been|is|was|were|are)?\s*(?:resolved|operating normally|fixed|restored|mitigated|closed)|fix was applied|operating normally again|restored correct routing)\b/i.test(
        cleanDesc.slice(-350),
      );

    if (!isResolved) {
      const isMajor =
        /\b(?:major|outage|critical|down|unavailable|failures)\b/i.test(
          `${item.title} ${cleanDesc}`,
        );
      const currentSeverity: ComponentStatus = isMajor
        ? "major_outage"
        : "degraded_performance";

      if (status !== "major_outage") {
        status = currentSeverity;
      }
    }
  }

  return status;
}

export interface AzureStatusSummary {
  translatorStatus: ComponentStatus;
  infraStatus: ComponentStatus;
}

const AZURE_STATUS_FEED_URL =
  "https://azurestatuscdn.azureedge.net/en-us/status/feed/";
const AZURE_MAJOR_KEYWORDS = ["outage", "unavailable", "down", "unable to access"];
const AZURE_TRANSLATOR_KEYWORDS = ["translator", "cognitive service"];

export async function pollAzureStatus(): Promise<AzureStatusSummary> {
  const xml = await fetchTextWithDiagnostics("Azure", AZURE_STATUS_FEED_URL);
  if (!xml) {
    return { translatorStatus: "operational", infraStatus: "operational" };
  }

  const items = extractRssItems(xml);
  if (items.length === 0 && !xml.includes("<channel>") && !xml.includes("<feed>")) {
    logUpstreamParseError("Azure", AZURE_STATUS_FEED_URL, "Invalid or empty RSS feed", xml.slice(0, 300));
    return { translatorStatus: "operational", infraStatus: "operational" };
  }

  let translatorStatus: ComponentStatus = "operational";
  let infraStatus: ComponentStatus = "operational";

  for (const item of items) {
    if (item.pubDate) {
      const pubTime = new Date(item.pubDate).getTime();
      if (!isNaN(pubTime) && Date.now() - pubTime > 72 * 60 * 60 * 1000) {
        continue;
      }
    }

    const haystack = `${item.title} ${item.description}`.toLowerCase();
    const isResolved =
      /\b(?:resolved|restored|mitigated|completed|operating normally)\b/i.test(
        item.title,
      ) ||
      /\b(?:resolved|restored|mitigated|completed|operating normally)\b/i.test(
        haystack.slice(-300),
      );

    if (isResolved) {
      continue;
    }

    const severity: ComponentStatus = AZURE_MAJOR_KEYWORDS.some((k) =>
      haystack.includes(k),
    )
      ? "major_outage"
      : "degraded_performance";

    if (infraStatus !== "major_outage") {
      infraStatus = severity;
    }
    if (
      AZURE_TRANSLATOR_KEYWORDS.some((k) => haystack.includes(k)) &&
      translatorStatus !== "major_outage"
    ) {
      translatorStatus = severity;
    }
  }

  return { translatorStatus, infraStatus };
}

export function parseTursoStatusJson(data: any): ComponentStatus {
  if (!data || typeof data !== "object") {
    return "operational";
  }

  const aggState = String(data.data?.attributes?.aggregate_state || "").toLowerCase();
  if (aggState === "downtime" || aggState === "major_outage" || aggState === "outage") {
    return "major_outage";
  }
  if (aggState === "degraded" || aggState === "partial_outage" || aggState === "degraded_performance") {
    return "degraded_performance";
  }

  const included = Array.isArray(data.included) ? data.included : [];
  let hasDowntime = false;
  let hasDegraded = false;

  for (const item of included) {
    if (item.type === "status_page_resource" && item.attributes) {
      const s = String(item.attributes.status || "").toLowerCase();
      const name = String(item.attributes.public_name || "").toLowerCase();
      if (s === "downtime" || s === "major_outage" || s === "outage") {
        if (name.includes("api") || name.includes("global") || name.includes("website")) {
          hasDowntime = true;
        } else {
          hasDegraded = true;
        }
      } else if (s === "degraded" || s === "partial_outage" || s === "maintenance") {
        hasDegraded = true;
      }
    } else if (item.type === "status_report" && item.attributes) {
      const reportState = String(item.attributes.aggregate_state || "").toLowerCase();
      if (reportState && reportState !== "resolved" && reportState !== "completed") {
        hasDegraded = true;
      }
    }
  }

  if (hasDowntime) return "major_outage";
  if (hasDegraded) return "degraded_performance";
  return "operational";
}

export async function pollTursoStatus(): Promise<ComponentStatus> {
  const url = "https://status.turso.tech/index.json";
  const data = await fetchJsonWithDiagnostics<any>("Turso", url);
  if (!data) {
    return "operational";
  }
  return parseTursoStatusJson(data);
}
