import { Env, isTursoConfigured, resolveMaintenanceDocUrl, resolveSiteConfig, resolveTursoConfig } from "../config";
import { ensureTrackingStart, initDatabaseSchema, pruneExpiredMetrics } from "../data/turso";
import { arbitrateSystemStatus } from "../arbitration/arbitrator";
import { evaluateMaintenanceSchedule } from "../incidents/maintenance";
import { runAllProviders, ProviderReport } from "../providers/index";
import { buildSiteAssets } from "../publish/assets";
import { deployAssets } from "../publish/pages";
import { logCycleSummary, logDiagnostic, logSystemError, setDebugMode } from "../logger";
import { Incident, SystemStatusSnapshot, TursoConfig } from "../types";
import { STATUS_DISPLAY_DAYS, collectCycleInputs } from "./inputs";

export interface CycleOptions {
  purgeCutoffSec?: number;
  runRetentionPrune?: boolean;
  manualIncident?: Incident;
}

const todayIsoDate = (): string => new Date().toISOString().slice(0, 10);

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function prepareDatabase(
  turso: TursoConfig,
  ctx: ExecutionContext,
  options: CycleOptions,
  cycleErrors: string[],
): Promise<void> {
  if (!isTursoConfigured(turso)) return;

  await initDatabaseSchema(turso).catch((error) => {
    cycleErrors.push(`Turso schema init failed: ${describeError(error)}`);
    logSystemError("TursoSchemaInit", error);
  });
  await ensureTrackingStart(turso, todayIsoDate()).catch((error) => logSystemError("TursoEnsureTrackingStart", error));
  if (options.runRetentionPrune !== false) {
    ctx.waitUntil(pruneExpiredMetrics(turso).catch((error) => logSystemError("TursoPruneExpiredMetrics", error)));
  }
}

function mergeIncidents(published: Incident[] | undefined, manual?: Incident): Incident[] {
  const merged = (Array.isArray(published) ? published : []).filter(Boolean);
  if (!manual) return merged;
  const index = merged.findIndex((incident) => incident.id === manual.id);
  if (index >= 0) merged[index] = manual;
  else merged.push(manual);
  return merged;
}

function resolveMainSiteAvailability(snapshot: SystemStatusSnapshot, reports: ProviderReport[]): boolean {
  const githubReport = reports.find((report) => report.id === "upstream_github");
  const githubStatus = snapshot.components.find((c) => c.id === "upstream_github")?.status || "operational";
  return (githubReport?.raw?.frontendProbe?.success ?? true) && githubStatus !== "major_outage";
}

export async function runStatusCycle(env: Env, ctx: ExecutionContext, options: CycleOptions = {}): Promise<void> {
  const startedAt = Date.now();
  const cycleErrors: string[] = [];
  setDebugMode(env.DEBUG === "1");

  const turso = resolveTursoConfig(env);
  const site = resolveSiteConfig(env);

  logDiagnostic(
    "CycleStart",
    `Config overview: Project="${env.CF_PAGES_PROJECT || ""}" | StatusURL="${site.statusUrl}" | MainSite="${site.mainSiteUrl}" | TursoConfigured=${isTursoConfigured(turso)} | PagesTokenConfigured=${Boolean(env.CF_PAGES_API_TOKEN)} | D1Configured=${Boolean(env.DB)}`,
  );

  await prepareDatabase(turso, ctx, options, cycleErrors);

  const inputs = await collectCycleInputs(
    env,
    turso,
    site.statusUrl,
    resolveMaintenanceDocUrl(env, site.githubRepoUrl),
    cycleErrors,
  );

  const { statusDistributionProbe } = inputs;
  const statusDistributionColdStart = !statusDistributionProbe.success && statusDistributionProbe.httpStatus === 404;
  if (!statusDistributionProbe.success && !statusDistributionColdStart) {
    cycleErrors.push(
      `Status distribution probe failed: ${statusDistributionProbe.detail || statusDistributionProbe.errorType}`,
    );
  }

  const nowUtc = new Date();
  const providerReports = await runAllProviders(env, {
    windowMetrics: inputs.windowMetrics,
    sharedState: new Map<string, any>(),
    mainSiteUrl: site.mainSiteUrl,
    statusUrl: site.statusUrl,
  });

  const snapshot = arbitrateSystemStatus({
    windowMetrics: inputs.windowMetrics,
    dayWindowMetrics: inputs.dayWindowMetrics,
    historyOverrides: inputs.historyOverrides,
    statusDistributionProbe,
    providerReports,
    maintenanceResult: evaluateMaintenanceSchedule(inputs.maintenanceItems, nowUtc),
    existingIncidents: mergeIncidents(inputs.publishedSnapshot?.incidents, options.manualIncident),
    statusDistributionColdStart,
    nowUtc,
    statusUrl: site.statusUrl,
    firstSeenDate: inputs.firstSeenDate || nowUtc.toISOString().slice(0, 10),
    retentionDays: STATUS_DISPLAY_DAYS,
    purgeCutoffSec: options.purgeCutoffSec,
  });

  const isMainSiteAvailable = resolveMainSiteAvailability(snapshot, providerReports);
  const assets = buildSiteAssets(
    snapshot,
    {
      ...site,
      feedbackUrl: isMainSiteAvailable ? site.feedbackUrl : `${site.githubRepoUrl}/issues`,
      isMainSiteAvailable,
    },
    { total: inputs.translationStats.total, last24h: inputs.translationStats.last24h, updatedAt: startedAt },
  );

  const canDeploy = Boolean(inputs.publishedSnapshot) || statusDistributionColdStart;
  if (!canDeploy) cycleErrors.push("Published snapshot unavailable; deployment skipped to preserve incident history");

  logCycleSummary(
    Date.now() - startedAt,
    snapshot.summary.overallStatus,
    snapshot.summary.activeIncidentsCount,
    cycleErrors,
  );

  if (canDeploy) await deployAssets(env, assets).catch((error) => logSystemError("PagesDeployment", error));
}
