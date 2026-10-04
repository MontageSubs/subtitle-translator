import { Env, isTursoConfigured } from "../config";
import {
  readRecentMetrics,
  readRollingComponentHistory,
  readTrackingStart,
  readTranslationStats,
} from "../data/turso";
import { fetchMaintenanceSchedule } from "../incidents/maintenance";
import { probeStatusDistribution } from "../monitoring/probe";
import { MONITORED_COMPONENT_IDS } from "../providers/index";
import { fetchPublishedStatusJson } from "../publish/pages";
import { logSystemError } from "../logger";
import { ComponentHistoryEntry, ProbeResult, TranslationStats, TursoConfig, WindowMetrics } from "../types";

export const STATUS_DISPLAY_DAYS = 90;

export interface CycleInputs {
  windowMetrics: WindowMetrics;
  dayWindowMetrics: WindowMetrics;
  historyMap: Map<string, ComponentHistoryEntry[]>;
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
    historyMap,
    translationStats,
    firstSeenDate,
    statusDistributionProbe,
    maintenanceItems,
    publishedSnapshot,
  ] = await Promise.all([
    guardedRead(
      enabled,
      {
        read: () => readRecentMetrics(turso, 3600),
        fallback: emptyMetrics,
        logTag: "TursoReadMetrics",
        cycleLabel: "readRecentMetrics",
      },
      cycleErrors,
    ),
    guardedRead(
      enabled,
      {
        read: () => readRecentMetrics(turso, 86400),
        fallback: emptyMetrics,
        logTag: "TursoReadDayMetrics",
        cycleLabel: "readRecentMetrics(24h)",
      },
      cycleErrors,
    ),
    guardedRead(
      enabled,
      {
        read: () => readRollingComponentHistory(turso, MONITORED_COMPONENT_IDS, STATUS_DISPLAY_DAYS),
        fallback: () => new Map<string, ComponentHistoryEntry[]>(),
        logTag: "TursoReadHistory",
        cycleLabel: "readHistory",
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
    historyMap,
    translationStats,
    firstSeenDate,
    statusDistributionProbe,
    maintenanceItems,
    publishedSnapshot,
  };
}
