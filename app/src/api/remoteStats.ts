import { STATS_URL } from '../config/config';
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

const REMOTE_BASE_KEY = "subtitle-translator:stats-remote-base";
const LOCAL_INCREMENT_KEY = "subtitle-translator:stats-local-increment";
const FETCH_TIMEOUT_MS = 5_000;

function readLocalIncrement(sinceUpdatedAt: number): number {
  const stored = persistentStorage.readJson<LocalIncrement>(LOCAL_INCREMENT_KEY);
  return stored?.sinceUpdatedAt === sinceUpdatedAt ? stored.count : 0;
}

function writeLocalIncrement(count: number, sinceUpdatedAt: number): void {
  persistentStorage.writeJson(LOCAL_INCREMENT_KEY, { count, sinceUpdatedAt } satisfies LocalIncrement);
}

function combine(base: RemoteBase | null): Stats | null {
  if (!base) return null;
  const increment = readLocalIncrement(base.updatedAt);
  return { total: base.total + increment, last24h: base.last24h + increment };
}

export function getCachedDisplayStats(): Stats | null {
  return combine(persistentStorage.readJson<RemoteBase>(REMOTE_BASE_KEY));
}

export async function refreshDisplayStats(): Promise<Stats | null> {
  if (!STATS_URL) return getCachedDisplayStats();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(STATS_URL, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return getCachedDisplayStats();
    const fresh = await response.json();
    reportMinClientVersion("stats", fresh?.meta?.minClientVersion);
    if (!isRemoteBase(fresh)) {
      reportUnreadableFormat("stats");
      return getCachedDisplayStats();
    }
    const existing = persistentStorage.readJson<RemoteBase>(REMOTE_BASE_KEY);
    if (!existing || fresh.updatedAt > existing.updatedAt) {
      const base: RemoteBase = { total: fresh.total, last24h: fresh.last24h, updatedAt: fresh.updatedAt };
      persistentStorage.writeJson(REMOTE_BASE_KEY, base);
      writeLocalIncrement(0, base.updatedAt);
      return combine(base);
    }
    return combine(existing);
  } catch {
    return getCachedDisplayStats();
  } finally {
    clearTimeout(timer);
  }
}

export function noteLocalTranslation(): void {
  const sinceUpdatedAt = persistentStorage.readJson<RemoteBase>(REMOTE_BASE_KEY)?.updatedAt ?? 0;
  writeLocalIncrement(readLocalIncrement(sinceUpdatedAt) + 1, sinceUpdatedAt);
}
