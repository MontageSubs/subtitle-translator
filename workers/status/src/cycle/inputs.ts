import { Env, isTursoConfigured } from "../config";
import {
  DAY_WINDOW_SECONDS,
  RECENT_WINDOW_SECONDS,
  readHistoryOverrides,
  readRecentMetrics,
  readTrackingStart,
  readTranslationStats,
} from "../data/turso";
import { fetchMaintenanceSchedule } from "../incidents/maintenance";
import { probeStatusDistribution } from "../monitoring/probe";
import { fetchPublishedStatusJson } from "../publish/pages";
import { logSystemError } from "../logger";
import { CellOverrides, ProbeResult, TranslationStats, TursoConfig, WindowMetrics } from "../types";

export const STATUS_DISPLAY_DAYS = 90;

export interface CycleInputs {
  windowMetrics: WindowMetrics;
  dayWindowMetrics: WindowMetrics;
  historyOverrides: CellOverrides;
  translationStats: TranslationStats;
  firstSeenDate: string | null;
  statusDistributionProbe: ProbeResult;
  maintenanceItems: Awaited<ReturnType<typeof fetchMaintenanceSchedule>>;
  publishedSnapshot: Awaited<ReturnType<typeof fetchPublishedStatusJson>>;
}

interface GuardedRead<T> {
  read: () => Promise<T>;
  fallback: () => T;
  logTag: string;
  cycleLabel?: string;
}

const emptyMetrics = (): WindowMetrics => ({ totalJobs: 0, errorsByCode: new Map<number, number>(), totalErrors: 0 });

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function guardedRead<T>(
  enabled: boolean,
  { read, fallback, logTag, cycleLabel }: GuardedRead<T>,
  cycleErrors: string[],
): Promise<T> {
  if (!enabled) return fallback();
  try {
    return await read();
  } catch (error) {
    if (cycleLabel) cycleErrors.push(`Turso ${cycleLabel} failed: ${describeError(error)}`);
    logSystemError(logTag, error);
    return fallback();
  }
}

export async function collectCycleInputs(
  env: Env,
  turso: TursoConfig,
  statusUrl: string,
  maintenanceDocUrl: string,
  cycleErrors: string[],
): Promise<CycleInputs> {
  const enabled = isTursoConfigured(turso);
  const [
    windowMetrics,
    dayWindowMetrics,
    historyOverrides,
    translationStats,
    firstSeenDate,
    statusDistributionProbe,
    maintenanceItems,
    publishedSnapshot,
  ] = await Promise.all([
    guardedRead(
      enabled,
      {
        read: () => readRecentMetrics(turso, RECENT_WINDOW_SECONDS),
        fallback: emptyMetrics,
        logTag: "TursoReadMetrics",
        cycleLabel: "readRecentMetrics",
      },
      cycleErrors,
    ),
    guardedRead(
      enabled,
      {
        read: () => readRecentMetrics(turso, DAY_WINDOW_SECONDS),
        fallback: emptyMetrics,
        logTag: "TursoReadDayMetrics",
        cycleLabel: "readRecentMetrics(24h)",
      },
      cycleErrors,
    ),
    guardedRead(
      enabled,
      {
        read: () => readHistoryOverrides(turso, STATUS_DISPLAY_DAYS),
        fallback: () => new Map() as CellOverrides,
        logTag: "TursoReadHistoryOverrides",
        cycleLabel: "readHistoryOverrides",
      },
      cycleErrors,
    ),
    guardedRead(
      enabled,
      {
        read: () => readTranslationStats(turso),
        fallback: () => ({ total: 0, last24h: 0, updatedAt: Date.now() }),
        logTag: "TursoReadTranslationStats",
      },
      cycleErrors,
    ),
    guardedRead(
      enabled,
      { read: () => readTrackingStart(turso), fallback: () => null, logTag: "TursoReadTrackingStart" },
      cycleErrors,
    ),
    probeStatusDistribution(statusUrl),
    fetchMaintenanceSchedule(maintenanceDocUrl),
    fetchPublishedStatusJson(env),
  ]);

  return {
    windowMetrics,
    dayWindowMetrics,
    historyOverrides,
    translationStats,
    firstSeenDate,
    statusDistributionProbe,
    maintenanceItems,
    publishedSnapshot,
  };
}
