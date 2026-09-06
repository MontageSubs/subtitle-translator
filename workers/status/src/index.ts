import {
  initDatabaseSchema,
  ensureTrackingStart,
  readTrackingStart,
  readRecentMetrics,
  readRollingComponentHistory,
  upsertDailySnapshots,
  readTranslationStats,
  purgeRecentData,
  pruneExpiredMetrics,
  deleteDailySnapshot,
} from "./turso";
import {
  fetchMaintenanceSchedule,
  evaluateMaintenanceSchedule,
} from "./maintenance";
import { arbitrateSystemStatus } from "./arbitrator";
import { renderStatusHtml, renderNotFoundGatewayHtml } from "./renderer";
import { renderStatusBadge } from "./badge";
import { probeFrontend, probeStatusDistribution } from "./probe";
import { publishSnapshot, pruneHistory, fetchPublishedStatusJson, Asset } from "./pages";
import { PROVIDER_PLUGINS, MONITORED_COMPONENT_IDS } from "./providers/index";
import { pollTursoStatus } from "./upstream";
import { ComponentStatus, TursoConfig } from "./types";
import { logCycleSummary, logSystemError, logDiagnostic, logPagesDeployment, setDebugMode } from "./logger";
import { resolveAdminRequest, AdminAction } from "./admin";

const STATUS_DISPLAY_DAYS = 90;

export interface Env {
  TURSO_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_PAGES_API_TOKEN?: string;
  CF_PAGES_PROJECT?: string;
  ALLOWED_ORIGIN?: string;
  STATUS_URL?: string;
  MAIN_SITE_URL?: string;
  ISSUE_REPORT_URL?: string;
  GITHUB_REPO_URL?: string;
  MAINTENANCE_DOC_URL?: string;
  DEBUG?: string;
  ADMIN_API_SECRET?: string;
  DB?: D1Database;
}

const DEPLOYMENTS_TO_KEEP = 3;

function resolveTursoConfig(env: Env): TursoConfig {
  return { url: env.TURSO_URL || "", authToken: env.TURSO_AUTH_TOKEN || "" };
}

async function executeStatusCycle(
  env: Env,
  ctx: ExecutionContext,
  opts?: { purgeCutoffSec?: number; purgeCutoffDate?: string },
): Promise<void> {
  const startedAt = Date.now();
  const cycleErrors: string[] = [];
  setDebugMode(env.DEBUG === "1");

  const tursoCfg = resolveTursoConfig(env);

  const mainSiteUrl =
    String(env.MAIN_SITE_URL || "https://subs.js.org/subtitle-translator/").replace(
      /\/+$/,
      "",
    ) + "/";
  const issueReportUrlBase =
    env.ISSUE_REPORT_URL || `${mainSiteUrl}docs/report-issue/`;
  const githubRepoUrl = String(
    env.GITHUB_REPO_URL || "https://github.com/MontageSubs/subtitle-translator"
  ).replace(/\/+$/, "");
  const statusUrl = String(
    env.STATUS_URL ||
    (env.CF_PAGES_PROJECT ? `https://${env.CF_PAGES_PROJECT}.pages.dev` : "")
  ).replace(/\/+$/, "");

  const rawRepoBase = String(githubRepoUrl).replace(
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
    const todayForTracking = new Date().toISOString().slice(0, 10);
    await ensureTrackingStart(tursoCfg, todayForTracking).catch((e) => {
      logSystemError("TursoEnsureTrackingStart", e);
    });
    ctx.waitUntil(
      pruneExpiredMetrics(tursoCfg).catch((e) => {
        logSystemError("TursoPruneExpiredMetrics", e);
      }),
    );
  }

  const [
    windowMetrics,
    dayWindowMetrics,
    historyMap,
    translationStats,
    firstSeenDate,
    frontendProbe,
    statusDistributionProbe,
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
      ? readRecentMetrics(tursoCfg, 86400).catch((e) => {
          cycleErrors.push(`Turso readRecentMetrics(24h) failed: ${e instanceof Error ? e.message : String(e)}`);
          logSystemError("TursoReadDayMetrics", e);
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
      ? readRollingComponentHistory(tursoCfg, MONITORED_COMPONENT_IDS, STATUS_DISPLAY_DAYS).catch((e) => {
          cycleErrors.push(`Turso readHistory failed: ${e instanceof Error ? e.message : String(e)}`);
          logSystemError("TursoReadHistory", e);
          return new Map();
        })
      : Promise.resolve(new Map()),
    tursoCfg.url && tursoCfg.authToken
      ? readTranslationStats(tursoCfg).catch((e) => {
          logSystemError("TursoReadTranslationStats", e);
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
    tursoCfg.url && tursoCfg.authToken
      ? readTrackingStart(tursoCfg).catch((e) => {
          logSystemError("TursoReadTrackingStart", e);
          return null;
        })
      : Promise.resolve(null),
    probeFrontend(mainSiteUrl),
    probeStatusDistribution(statusUrl),
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
  const statusDistributionColdStart =
    !statusDistributionProbe.success && statusDistributionProbe.httpStatus === 404;
  if (!statusDistributionProbe.success && !statusDistributionColdStart) {
    cycleErrors.push(`Status distribution probe failed: ${statusDistributionProbe.detail || statusDistributionProbe.errorType}`);
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
    dayWindowMetrics,
    historyMap,
    frontendProbe,
    statusDistributionProbe,
    tursoPlatformStatus,
    providerChecks,
    sharedState,
    maintenanceResult,
    existingIncidents: publishedStatusJson?.incidents || [],
    statusDistributionColdStart,
    nowUtc,
    statusUrl,
    firstSeenDate: firstSeenDate || nowUtc.toISOString().slice(0, 10),
    retentionDays: STATUS_DISPLAY_DAYS,
    purgeCutoffSec: opts?.purgeCutoffSec,
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
  const issueReportUrl = isMainSiteAvailable ? issueReportUrlBase : `${githubRepoUrl}/issues`;

  const htmlContent = renderStatusHtml(arbitration.snapshot, {
    mainSiteUrl,
    issueReportUrl,
    githubRepoUrl,
    statusUrl,
    isMainSiteAvailable,
  });

  const translationStatsOutput = {
    total: translationStats.total,
    last24h: translationStats.last24h,
    updatedAt: startedAt,
  };

  const badgeContent = renderStatusBadge(
    arbitration.snapshot.summary.overallStatus,
  );

  const headersConfig = `/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=300, s-maxage=300\n\n/status.json\n  Content-Type: application/json; charset=utf-8\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=60\n\n/stats.json\n  Content-Type: application/json; charset=utf-8\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=60\n\n/badge.svg\n  Content-Type: image/svg+xml; charset=utf-8\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=120\n`;

  const gateway404Html = renderNotFoundGatewayHtml(mainSiteUrl);

  const filesToPublish: Asset[] = [
    { path: "index.html", content: htmlContent, contentType: "text/html" },
    { path: "404.html", content: gateway404Html, contentType: "text/html" },
    { path: "status.json", content: JSON.stringify(arbitration.snapshot, null, 2), contentType: "application/json" },
    { path: "stats.json", content: JSON.stringify(translationStatsOutput, null, 2), contentType: "application/json" },
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

  try {
    const deployId = await publishSnapshot(env, filesToPublish);
    if (deployId) {
      logPagesDeployment("Deployment publish finished", { deployId });
    } else {
      logPagesDeployment("Deployment publish returned empty ID");
    }
    await pruneHistory(env, DEPLOYMENTS_TO_KEEP);
  } catch (e) {
    logSystemError("PagesDeployment", e);
  }
}

async function executeAdminAction(
  action: AdminAction,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const tursoCfg = resolveTursoConfig(env);
  const isTursoReady = Boolean(tursoCfg.url && tursoCfg.authToken);

  switch (action.kind) {
    case "health":
      return new Response(
        JSON.stringify({
          success: true,
          tursoConfigured: isTursoReady,
          pagesConfigured: Boolean(env.CF_ACCOUNT_ID && env.CF_PAGES_API_TOKEN && env.CF_PAGES_PROJECT),
          d1Configured: Boolean(env.DB),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    case "trigger_cycle":
      ctx.waitUntil(executeStatusCycle(env, ctx));
      return new Response(JSON.stringify({ success: true, enqueued: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });

    case "purge_recent": {
      if (!isTursoReady) {
        return new Response(JSON.stringify({ success: false, error: "turso not configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      const result = await purgeRecentData(tursoCfg, action.days).catch((e) => {
        logSystemError("AdminPurge", e);
        return null;
      });
      if (!result) {
        return new Response(JSON.stringify({ success: false, error: "purge failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      ctx.waitUntil(
        executeStatusCycle(env, ctx, {
          purgeCutoffSec: result.cutoffSec,
          purgeCutoffDate: result.cutoffDate,
        }),
      );
      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    case "delete_snapshot": {
      if (!isTursoReady) {
        return new Response(JSON.stringify({ success: false, error: "turso not configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      await deleteDailySnapshot(tursoCfg, action.date, action.componentId).catch((e) => {
        logSystemError("AdminDeleteSnapshot", e);
        throw e;
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    case "upsert_snapshot": {
      if (!isTursoReady) {
        return new Response(JSON.stringify({ success: false, error: "turso not configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      await upsertDailySnapshots(tursoCfg, action.date, [
        {
          componentId: action.componentId,
          status: action.status,
          uptimeRatio: action.uptimeRatio,
          totalEvents: action.totalEvents,
          failureEvents: action.failureEvents,
        },
      ]).catch((e) => {
        logSystemError("AdminUpsertSnapshot", e);
        throw e;
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
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

    const adminResolution = await resolveAdminRequest(request, env.ADMIN_API_SECRET);
    if (adminResolution) {
      if ("response" in adminResolution) return adminResolution.response;
      return executeAdminAction(adminResolution.action, env, ctx).catch((e) => {
        logSystemError("AdminAction", e);
        return new Response(JSON.stringify({ success: false, error: "internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      });
    }

    if (
      request.method === "GET" &&
      (url.pathname.startsWith("/docs") ||
        url.pathname.startsWith("/about") ||
        url.pathname.startsWith("/apps") ||
        url.pathname.startsWith("/history") ||
        url.pathname.startsWith("/contribute") ||
        url.pathname.startsWith("/discussions"))
    ) {
      const mainSite = String(
        env.MAIN_SITE_URL || "https://subs.js.org/subtitle-translator/",
      ).replace(/\/+$/, "");
      return new Response(renderNotFoundGatewayHtml(mainSite), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found.", { status: 404 });
  },
};
