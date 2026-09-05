import {
  initDatabaseSchema,
  readRecentMetrics,
  readRollingComponentHistory,
  upsertDailySnapshots,
  readLegacyStats,
} from "./turso";
import {
  fetchMaintenanceSchedule,
  evaluateMaintenanceSchedule,
} from "./maintenance";
import { arbitrateSystemStatus } from "./arbitrator";
import { renderStatusHtml } from "./renderer";
import { renderStatusBadge } from "./badge";
import { probeFrontend, probeStatusDistribution, probeTurso } from "./probe";
import { publishSnapshot, pruneHistory, fetchPublishedStatusJson, Asset } from "./pages";
import { PROVIDER_PLUGINS } from "./providers/index";
import { pollTursoStatus } from "./upstream";
import { ComponentStatus } from "./types";
import { logCycleSummary, logSystemError, logDiagnostic, logPagesDeployment } from "./logger";

export interface Env {
  TURSO_URL?: string;
  TURSO_READ_AUTH_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_PAGES_API_TOKEN?: string;
  CF_PAGES_PROJECT?: string;
  ALLOWED_ORIGIN?: string;
  STATUS_URL?: string;
  MAIN_SITE_URL?: string;
  ISSUE_REPORT_URL?: string;
  GITHUB_REPO_URL?: string;
  MAINTENANCE_DOC_URL?: string;
  DB?: D1Database;
}

const DEPLOYMENTS_TO_KEEP = 3;

const MONITORED_COMPONENT_IDS = [
  "service_availability",
  "core_infrastructure",
  "status_system",
  "upstream_storage",
  ...PROVIDER_PLUGINS.map((p) => p.id),
];

async function executeStatusCycle(
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const startedAt = Date.now();
  const cycleErrors: string[] = [];

  const tursoCfg = {
    url: env.TURSO_URL || "",
    authToken: env.TURSO_READ_AUTH_TOKEN || "",
  };

  const mainSiteUrl =
    (env.MAIN_SITE_URL || "https://subs.js.org/subtitle-translator/").replace(
      /\/+$/,
      "",
    ) + "/";
  const issueReportUrl =
    env.ISSUE_REPORT_URL || `${mainSiteUrl}docs/report-issue/`;
  const githubRepoUrl = (
    env.GITHUB_REPO_URL || "https://github.com/MontageSubs/subtitle-translator"
  ).replace(/\/+$/, "");
  const statusUrl = (
    env.STATUS_URL ||
    (env.CF_PAGES_PROJECT ? `https://${env.CF_PAGES_PROJECT}.pages.dev` : "")
  ).replace(/\/+$/, "");

  const rawRepoBase = githubRepoUrl.replace(
    "https://github.com/",
    "https://raw.githubusercontent.com/",
  );
  const maintenanceDocUrl =
    env.MAINTENANCE_DOC_URL ||
    `${rawRepoBase}/main/workers/status/MAINTENANCE.md`;

  logDiagnostic("CycleStart", `Config overview: Project="${env.CF_PAGES_PROJECT || ''}" | StatusURL="${statusUrl}" | MainSite="${mainSiteUrl}" | TursoConfigured=${Boolean(tursoCfg.url && tursoCfg.authToken)} | PagesTokenConfigured=${Boolean(env.CF_PAGES_API_TOKEN)} | D1Configured=${Boolean(env.DB)}`);

  if (tursoCfg.url && tursoCfg.authToken) {
    await initDatabaseSchema(tursoCfg).catch((e) => {
      cycleErrors.push(`Turso schema init failed: ${e instanceof Error ? e.message : String(e)}`);
      logSystemError("TursoSchemaInit", e);
    });
  }

  const [
    windowMetrics,
    historyMap,
    legacyStats,
    frontendProbe,
    statusDistributionProbe,
    storageProbe,
    tursoPlatformStatus,
    maintenanceItems,
    publishedStatusJson,
  ] = await Promise.all([
    tursoCfg.url && tursoCfg.authToken
      ? readRecentMetrics(tursoCfg, 3600).catch((e) => {
          cycleErrors.push(`Turso readRecentMetrics failed: ${e instanceof Error ? e.message : String(e)}`);
          logSystemError("TursoReadMetrics", e);
          return {
            totalJobs: 0,
            errorsByCode: new Map<number, number>(),
            totalErrors: 0,
          };
        })
      : Promise.resolve({
          totalJobs: 0,
          errorsByCode: new Map<number, number>(),
          totalErrors: 0,
        }),
    tursoCfg.url && tursoCfg.authToken
      ? readRollingComponentHistory(tursoCfg, MONITORED_COMPONENT_IDS, 90).catch((e) => {
          cycleErrors.push(`Turso readHistory failed: ${e instanceof Error ? e.message : String(e)}`);
          logSystemError("TursoReadHistory", e);
          return new Map();
        })
      : Promise.resolve(new Map()),
    tursoCfg.url && tursoCfg.authToken
      ? readLegacyStats(tursoCfg).catch((e) => {
          logSystemError("TursoReadLegacyStats", e);
          return {
            total: 0,
            last24h: 0,
            updatedAt: Date.now(),
          };
        })
      : Promise.resolve({
          total: 0,
          last24h: 0,
          updatedAt: Date.now(),
        }),
    probeFrontend(mainSiteUrl),
    probeStatusDistribution(statusUrl),
    probeTurso(tursoCfg.url),
    pollTursoStatus().catch((): ComponentStatus => "operational"),
    fetchMaintenanceSchedule(maintenanceDocUrl),
    fetchPublishedStatusJson({
      CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
      CF_PAGES_API_TOKEN: env.CF_PAGES_API_TOKEN,
      CF_PAGES_PROJECT: env.CF_PAGES_PROJECT,
      STATUS_URL: env.STATUS_URL,
    }),
  ]);

  if (!frontendProbe.success) {
    cycleErrors.push(`Frontend probe failed: ${frontendProbe.detail || frontendProbe.errorType}`);
  }
  if (!statusDistributionProbe.success) {
    cycleErrors.push(`Status distribution probe failed: ${statusDistributionProbe.detail || statusDistributionProbe.errorType}`);
  }
  if (storageProbe && !storageProbe.success && storageProbe.errorType !== "unconfigured") {
    cycleErrors.push(`Storage probe failed: ${storageProbe.detail || storageProbe.errorType}`);
  }

  const nowUtc = new Date();
  const maintenanceResult = evaluateMaintenanceSchedule(
    maintenanceItems,
    nowUtc,
  );

  const sharedState = new Map<string, any>();
  const preFetches = PROVIDER_PLUGINS.map(async (p) => {
    if (p.preFetch) {
      await p
        .preFetch(env, sharedState)
        .catch((e) => {
          cycleErrors.push(`Provider preFetch error for ${p.id}: ${e instanceof Error ? e.message : String(e)}`);
          logSystemError(`preFetch:${p.id}`, e);
        });
    }
  });
  await Promise.all(preFetches);

  const providerChecks = await Promise.all(
    PROVIDER_PLUGINS.map(async (plugin) => {
      const result = await plugin.check(env, sharedState).catch((e) => {
        cycleErrors.push(`Provider check error for ${plugin.id}: ${e instanceof Error ? e.message : String(e)}`);
        logSystemError(`check:${plugin.id}`, e);
        return null;
      });
      return { plugin, result };
    }),
  );

  const arbitration = arbitrateSystemStatus({
    windowMetrics,
    historyMap,
    frontendProbe,
    statusDistributionProbe,
    storageProbe,
    tursoPlatformStatus,
    providerChecks,
    sharedState,
    maintenanceResult,
    existingIncidents: publishedStatusJson?.incidents || [],
    nowUtc,
    statusUrl,
  });

  const todayDateStr = nowUtc.toISOString().slice(0, 10);
  if (tursoCfg.url && tursoCfg.authToken) {
    ctx.waitUntil(
      upsertDailySnapshots(
        tursoCfg,
        todayDateStr,
        arbitration.dailySnapshotsToPersist,
      ).catch((e) => {
        logSystemError("TursoSnapshotPersist", e);
      }),
    );
  }

  const ghResult = arbitration.snapshot.components.find(
    (c) => c.id === "upstream_github",
  );
  const ghStatus = ghResult?.status || "operational";
  const isMainSiteAvailable = frontendProbe.success && ghStatus !== "major_outage";

  const htmlContent = renderStatusHtml(arbitration.snapshot, {
    mainSiteUrl,
    issueReportUrl,
    githubRepoUrl,
    statusUrl,
    isMainSiteAvailable,
  });

  const legacyStatsOutput = {
    total: legacyStats.total,
    last24h: legacyStats.last24h,
    updatedAt: startedAt,
  };

  const badgeContent = renderStatusBadge(
    arbitration.snapshot.summary.overallStatus,
  );

  const headersConfig = `/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=300, s-maxage=300\n\n/status.json\n  Content-Type: application/json; charset=utf-8\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=60\n\n/stats.json\n  Content-Type: application/json; charset=utf-8\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=60\n\n/badge.svg\n  Content-Type: image/svg+xml; charset=utf-8\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=120\n`;

  const filesToPublish: Asset[] = [
    { path: "index.html", content: htmlContent, contentType: "text/html" },
    { path: "status.json", content: JSON.stringify(arbitration.snapshot, null, 2), contentType: "application/json" },
    { path: "stats.json", content: JSON.stringify(legacyStatsOutput, null, 2), contentType: "application/json" },
    { path: "badge.svg", content: badgeContent, contentType: "image/svg+xml" },
    { path: "_headers", content: headersConfig, contentType: "text/plain" },
  ];

  const durationMs = Date.now() - startedAt;
  logCycleSummary(
    durationMs,
    arbitration.snapshot.summary.overallStatus,
    arbitration.snapshot.summary.activeIncidentsCount,
    cycleErrors,
  );

  ctx.waitUntil(
    (async () => {
      logPagesDeployment("Background deployment task dispatched");
      const deployId = await publishSnapshot(env, filesToPublish);
      if (deployId) {
        logPagesDeployment("Deployment publish finished", { deployId });
      } else {
        logPagesDeployment("Deployment publish returned empty ID");
      }
      await pruneHistory(env, DEPLOYMENTS_TO_KEEP);
    })().catch((e) => {
      logSystemError("PagesDeployment", e);
    }),
  );
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    await executeStatusCycle(env, ctx);
  },
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/_force_trigger") {
      ctx.waitUntil(executeStatusCycle(env, ctx));
      return new Response("Force trigger enqueued", { status: 202 });
    }
    return new Response("Status Worker is running.", { status: 200 });
  },
};
