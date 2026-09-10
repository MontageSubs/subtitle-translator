import { publishSnapshot, pruneHistory, Asset } from "../src/pages";
import { resolveManualIncident, pushManualIncident, deleteManualIncident, editMessageInSnapshot, deleteMessageInSnapshot, resolveManualIncidentId, deleteSnapshotFromSnapshot, upsertSnapshotInSnapshot, renderSnapshotAssets } from "../src/manualOps";
import { SystemStatusSnapshot, IncidentSeverity, IncidentStatus } from "../src/types";
import { COMPONENT_DEFINITIONS } from "../src/arbitrator";

const env = {
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  CF_PAGES_API_TOKEN: process.env.CF_PAGES_API_TOKEN,
  CF_PAGES_PROJECT: process.env.CF_PAGES_PROJECT,
  STATUS_URL: process.env.STATUS_URL,
};

const DEPLOYMENTS_TO_KEEP = 3;

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function createBaselineSnapshot(): SystemStatusSnapshot {
  const now = new Date().toISOString();
  const components = COMPONENT_DEFINITIONS.map((c) => ({
    id: c.id,
    name: c.name,
    group: c.group,
    status: "operational" as const,
    uptime90d: 100,
    history90d: [],
  }));
  const base = String(
    env.STATUS_URL ||
    (env.CF_PAGES_PROJECT ? `https://${env.CF_PAGES_PROJECT}.pages.dev` : "")
  ).replace(/\/+$/, "");
  return {
    meta: {
      generatedAt: now,
      apiVersion: "v1",
      version: "1.0.0",
      environment: "production",
      retentionDays: 90,
      badgeUrl: `${base}/badge.svg`,
    },
    summary: {
      overallStatus: "operational",
      rolling90dRatio: 100,
      rollingDays: 90,
      activeIncidentsCount: 0,
      past24hAvailability: 100,
    },
    components,
    incidents: [],
    externalReferences: [],
  };
}

async function tryFetchSnapshot(targetUrl: string): Promise<SystemStatusSnapshot | null> {
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Cache-Control": "no-cache",
      },
    });
    if (response.ok) {
      return (await response.json()) as SystemStatusSnapshot;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchPublishedSnapshot(): Promise<SystemStatusSnapshot> {
  const candidates: string[] = [];
  if (env.CF_PAGES_PROJECT) {
    candidates.push(`https://${env.CF_PAGES_PROJECT}.pages.dev/status.json?_t=${Date.now()}`);
  }
  if (env.STATUS_URL) {
    const customBase = String(env.STATUS_URL).replace(/\/+$/, "");
    candidates.push(`${customBase}/status.json?_t=${Date.now()}`);
  }

  for (const url of candidates) {
    const data = await tryFetchSnapshot(url);
    if (data) {
      return data;
    }
  }

  if (env.CF_ACCOUNT_ID && env.CF_PAGES_API_TOKEN && env.CF_PAGES_PROJECT) {
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${env.CF_PAGES_PROJECT}/deployments?env=production&page=1&per_page=1`,
        {
          headers: {
            Authorization: `Bearer ${env.CF_PAGES_API_TOKEN}`,
            "User-Agent": BROWSER_USER_AGENT,
          },
        },
      );
      if (res.ok) {
        const body = (await res.json()) as { success: boolean; result?: Array<{ url?: string }> };
        const deploymentUrl = body.result?.[0]?.url;
        if (deploymentUrl) {
          const cleanDeployUrl = String(deploymentUrl).replace(/\/+$/, "");
          const data = await tryFetchSnapshot(`${cleanDeployUrl}/status.json?_t=${Date.now()}`);
          if (data) {
            return data;
          }
        }
      }
    } catch {
      return createBaselineSnapshot();
    }
  }

  return createBaselineSnapshot();
}

function renderContext() {
  const mainSiteUrl =
    String(process.env.MAIN_SITE_URL || "https://subs.js.org/subtitle-translator/").replace(/\/+$/, "") + "/";
  const statusUrl = String(
    env.STATUS_URL ||
    (env.CF_PAGES_PROJECT ? `https://${env.CF_PAGES_PROJECT}.pages.dev` : "")
  ).replace(/\/+$/, "");
  return {
    mainSiteUrl,
    issueReportUrl: process.env.ISSUE_REPORT_URL || `${mainSiteUrl}docs/report-issue/`,
    githubRepoUrl: String(process.env.GITHUB_REPO_URL || "https://github.com/MontageSubs/subtitle-translator").replace(/\/+$/, ""),
    statusUrl,
    isMainSiteAvailable: true,
  };
}

async function publish(snapshot: SystemStatusSnapshot): Promise<void> {
  if (snapshot && snapshot.meta) {
    snapshot.meta.generatedAt = new Date().toISOString();
  }
  const assets: Asset[] = renderSnapshotAssets(snapshot, renderContext());
  await publishSnapshot(env, assets);
  await pruneHistory(env, DEPLOYMENTS_TO_KEEP).catch(() => {});
}

async function main(): Promise<void> {
  const mode = process.env.MODE;
  const published = await fetchPublishedSnapshot();

  if (mode === "hardcoded" || mode === "trigger_cycle_hardcoded") {
    await publish(published);
    console.log(JSON.stringify({ success: true }));
    return;
  }

  if (mode === "resolve_incident") {
    const rawIncidentId = process.env.INCIDENT_ID || process.env.COMPONENT_ID || "";
    const incidentId = rawIncidentId.trim().replace(/^#/, "");
    if (!incidentId) throw new Error("INCIDENT_ID or COMPONENT_ID is required for resolve_incident");
    await publish(resolveManualIncident(published, incidentId));
    console.log(JSON.stringify({ success: true, incidentId }));
    return;
  }

  if (mode === "delete_incident") {
    const rawIncidentId = process.env.INCIDENT_ID || process.env.COMPONENT_ID || "";
    const incidentId = rawIncidentId.trim().replace(/^#/, "");
    if (!incidentId) throw new Error("INCIDENT_ID or COMPONENT_ID is required for delete_incident");
    await publish(deleteManualIncident(published, incidentId));
    console.log(JSON.stringify({ success: true, incidentId }));
    return;
  }

  if (mode === "edit_message") {
    const rawMessageId = process.env.MESSAGE_ID || process.env.INCIDENT_ID || "";
    const messageId = rawMessageId.trim().replace(/^#/, "");
    if (!messageId) throw new Error("MESSAGE_ID is required for edit_message");
    let status = process.env.STATUS as IncidentStatus | undefined;
    if (String(status) === "operational") status = "resolved";
    if (String(status) === "degraded") status = "identified";
    if (String(status) === "outage" || String(status) === "nodata") status = "investigating";
    await publish(
      editMessageInSnapshot(published, {
        messageId,
        body: process.env.MESSAGE || undefined,
        status,
      }),
    );
    console.log(JSON.stringify({ success: true, messageId }));
    return;
  }

  if (mode === "delete_message") {
    const rawMessageId = process.env.MESSAGE_ID || process.env.INCIDENT_ID || "";
    const messageId = rawMessageId.trim().replace(/^#/, "");
    if (!messageId) throw new Error("MESSAGE_ID is required for delete_message");
    await publish(deleteMessageInSnapshot(published, messageId));
    console.log(JSON.stringify({ success: true, messageId }));
    return;
  }

  if (mode === "delete_snapshot") {
    const date = process.env.DATE || "";
    if (!date) throw new Error("DATE is required for delete_snapshot");
    const componentId = process.env.COMPONENT_ID || undefined;
    await publish(deleteSnapshotFromSnapshot(published, date, componentId));
    console.log(JSON.stringify({ success: true, date, componentId }));
    return;
  }

  if (mode === "upsert_snapshot") {
    const date = process.env.DATE || "";
    const componentId = process.env.COMPONENT_ID || "";
    if (!date || !componentId) throw new Error("DATE and COMPONENT_ID are required for upsert_snapshot");
    const status = process.env.STATUS;
    const rawRatio = process.env.UPTIME_RATIO;
    const uptimeRatio = rawRatio !== undefined && rawRatio !== "" ? parseFloat(rawRatio) : undefined;
    await publish(upsertSnapshotInSnapshot(published, { date, componentId, status, uptimeRatio }));
    console.log(JSON.stringify({ success: true, date, componentId }));
    return;
  }

  if (mode === "push_incident" || mode === "update_incident") {
    const incidentMode = process.env.INCIDENT_MODE === "update" || mode === "update_incident" ? "update" : "new";
    const componentId = process.env.COMPONENT_ID;
    if (!componentId) throw new Error("COMPONENT_ID is required");
    const rawIncidentId = process.env.INCIDENT_ID ? process.env.INCIDENT_ID.trim().replace(/^#/, "") : undefined;
    const incidentId = resolveManualIncidentId(incidentMode, rawIncidentId, componentId);
    const compDef = COMPONENT_DEFINITIONS.find((c) => c.id === componentId);
    const componentName = process.env.COMPONENT_NAME || compDef?.name || componentId;
    let status = (process.env.STATUS || "investigating") as IncidentStatus;
    if (String(status) === "operational") status = "resolved";
    if (String(status) === "degraded") status = "identified";
    if (String(status) === "outage" || String(status) === "nodata") status = "investigating";
    await publish(
      pushManualIncident(published, {
        incidentId,
        componentId,
        componentName,
        severity: (process.env.SEVERITY || "minor") as IncidentSeverity,
        status,
        message: process.env.MESSAGE || undefined,
      }),
    );
    console.log(JSON.stringify({ success: true, incidentId }));
    return;
  }

  throw new Error(`unknown MODE: ${mode}`);
}

main().catch((e) => {
  console.error(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
