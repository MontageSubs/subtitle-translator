import { publishSnapshot, pruneHistory, Asset } from "../src/pages";
import { resolveManualIncident, pushManualIncident, resolveManualIncidentId, renderSnapshotAssets } from "../src/manualOps";
import { SystemStatusSnapshot, IncidentSeverity, IncidentStatus } from "../src/types";

const env = {
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  CF_PAGES_API_TOKEN: process.env.CF_PAGES_API_TOKEN,
  CF_PAGES_PROJECT: process.env.CF_PAGES_PROJECT,
  STATUS_URL: process.env.STATUS_URL,
};

const DEPLOYMENTS_TO_KEEP = 3;

async function fetchPublishedSnapshot(): Promise<SystemStatusSnapshot> {
  const base = String(env.STATUS_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("STATUS_URL is required");
  const response = await fetch(`${base}/status.json?_t=${Date.now()}`);
  if (!response.ok) throw new Error(`failed to fetch published status.json: ${response.status}`);
  return response.json() as Promise<SystemStatusSnapshot>;
}

function renderContext() {
  const mainSiteUrl =
    String(process.env.MAIN_SITE_URL || "https://subs.js.org/subtitle-translator/").replace(/\/+$/, "") + "/";
  return {
    mainSiteUrl,
    issueReportUrl: process.env.ISSUE_REPORT_URL || `${mainSiteUrl}docs/report-issue/`,
    githubRepoUrl: String(process.env.GITHUB_REPO_URL || "https://github.com/MontageSubs/subtitle-translator").replace(/\/+$/, ""),
    statusUrl: String(env.STATUS_URL || "").replace(/\/+$/, ""),
    isMainSiteAvailable: true,
  };
}

async function publish(snapshot: SystemStatusSnapshot): Promise<void> {
  const assets: Asset[] = renderSnapshotAssets(snapshot, renderContext());
  await publishSnapshot(env, assets);
  await pruneHistory(env, DEPLOYMENTS_TO_KEEP).catch(() => {});
}

async function main(): Promise<void> {
  const mode = process.env.MODE;
  const published = await fetchPublishedSnapshot();

  if (mode === "hardcoded") {
    await publish(published);
    console.log(JSON.stringify({ success: true }));
    return;
  }

  if (mode === "resolve_incident") {
    const rawIncidentId = process.env.INCIDENT_ID || "";
    const incidentId = rawIncidentId.trim().replace(/^#/, "");
    if (!incidentId) throw new Error("INCIDENT_ID is required");
    await publish(resolveManualIncident(published, incidentId));
    console.log(JSON.stringify({ success: true, incidentId }));
    return;
  }

  if (mode === "push_incident") {
    const incidentMode = process.env.INCIDENT_MODE === "update" ? "update" : "new";
    const componentId = process.env.COMPONENT_ID;
    if (!componentId) throw new Error("COMPONENT_ID is required");
    const rawIncidentId = process.env.INCIDENT_ID ? process.env.INCIDENT_ID.trim().replace(/^#/, "") : undefined;
    const incidentId = resolveManualIncidentId(incidentMode, rawIncidentId, componentId);
    await publish(
      pushManualIncident(published, {
        incidentId,
        componentId,
        componentName: process.env.COMPONENT_NAME || componentId,
        severity: (process.env.SEVERITY || "minor") as IncidentSeverity,
        status: (process.env.STATUS || "investigating") as IncidentStatus,
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
