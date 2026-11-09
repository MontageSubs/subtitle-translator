import { reportNetworkFailure, reportNetworkSuccess } from "../lib/net/serviceReachability";
import { statsSourceUrls } from "../lib/net/statusSources";
import { isFresh, markFresh } from '../lib/net/freshness';
import { STATS_URL } from "../config/environment";
import { STORAGE_KEYS } from "../config/storage";
import { persistentStorage } from '../utils/safeStorage';
import { reportMinClientVersion, reportUnreadableFormat } from '../update/updateWatcher';

export interface Stats {
  total: number;
  last24h: number;
}

interface RemoteBase extends Stats {
  updatedAt: number;
}

interface LocalIncrement {
  count: number;
  sinceUpdatedAt: number;
}

const isRemoteBase = (value: any): value is RemoteBase =>
  typeof value?.total === "number" && typeof value.last24h === "number" && typeof value.updatedAt === "number";

const FETCH_TIMEOUT_MS = 5_000;

function readLocalIncrement(sinceUpdatedAt: number): number {
  const stored = persistentStorage.readJson<LocalIncrement>(STORAGE_KEYS.statsLocalIncrement);
  return stored?.sinceUpdatedAt === sinceUpdatedAt ? stored.count : 0;
}

function writeLocalIncrement(count: number, sinceUpdatedAt: number): void {
  persistentStorage.writeJson(STORAGE_KEYS.statsLocalIncrement, { count, sinceUpdatedAt } satisfies LocalIncrement);
}

function combine(base: RemoteBase | null): Stats | null {
  if (!base) return null;
  const increment = readLocalIncrement(base.updatedAt);
  return { total: base.total + increment, last24h: base.last24h + increment };
}

export function getCachedDisplayStats(): Stats | null {
  return combine(persistentStorage.readJson<RemoteBase>(STORAGE_KEYS.statsRemoteBase));
}

type StatsFetch = { kind: "ok"; fresh: any } | { kind: "unreadable" } | { kind: "unreachable" };

async function fetchStatsFrom(url: string): Promise<StatsFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    reportNetworkSuccess(url);
    return response.ok ? { kind: "ok", fresh: await response.json() } : { kind: "unreachable" };
  } catch (error) {
    reportNetworkFailure(url, error);
    return { kind: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFreshStats(): Promise<StatsFetch> {
  for (const url of statsSourceUrls()) {
    const result = await fetchStatsFrom(url);
    if (result.kind === "ok") return isRemoteBase(result.fresh) ? result : { kind: "unreadable" };
  }
  return { kind: "unreachable" };
}

export async function refreshDisplayStats(): Promise<Stats | null> {
  if (!STATS_URL || (isFresh(STORAGE_KEYS.statsFetchedAt) && getCachedDisplayStats())) return getCachedDisplayStats();
  const result = await fetchFreshStats();
  if (result.kind === "unreachable") return getCachedDisplayStats();
  if (result.kind === "unreadable") {
    reportUnreadableFormat("stats");
    return getCachedDisplayStats();
  }
  const { fresh } = result;
  markFresh(STORAGE_KEYS.statsFetchedAt);
  reportMinClientVersion("stats", fresh?.meta?.minClientVersion);
  const existing = persistentStorage.readJson<RemoteBase>(STORAGE_KEYS.statsRemoteBase);
  if (!existing || fresh.updatedAt > existing.updatedAt) {
    const base: RemoteBase = { total: fresh.total, last24h: fresh.last24h, updatedAt: fresh.updatedAt };
    persistentStorage.writeJson(STORAGE_KEYS.statsRemoteBase, base);
    writeLocalIncrement(0, base.updatedAt);
    return combine(base);
  }
  return combine(existing);
}

export function noteLocalTranslation(): void {
  const sinceUpdatedAt = persistentStorage.readJson<RemoteBase>(STORAGE_KEYS.statsRemoteBase)?.updatedAt ?? 0;
  writeLocalIncrement(readLocalIncrement(sinceUpdatedAt) + 1, sinceUpdatedAt);
}
