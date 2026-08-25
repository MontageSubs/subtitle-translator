import { STATS_URL } from "../config";

export interface Stats {
  total: number;
  last24h: number;
}

interface RemoteBase extends Stats {
  updatedAt: number;
}

const REMOTE_BASE_KEY = "subtitle-translator:stats-remote-base";
const LOCAL_INCREMENT_KEY = "subtitle-translator:stats-local-increment";
const FETCH_TIMEOUT_MS = 5_000;

function readRemoteBase(): RemoteBase | null {
  try {
    const raw = localStorage.getItem(REMOTE_BASE_KEY);
    return raw ? (JSON.parse(raw) as RemoteBase) : null;
  } catch {
    return null;
  }
}

function writeRemoteBase(base: RemoteBase): void {
  try {
    localStorage.setItem(REMOTE_BASE_KEY, JSON.stringify(base));
  } catch {
    return;
  }
}

function readLocalIncrement(sinceUpdatedAt: number): number {
  try {
    const raw = localStorage.getItem(LOCAL_INCREMENT_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { count: number; sinceUpdatedAt: number };
    return parsed.sinceUpdatedAt === sinceUpdatedAt ? parsed.count : 0;
  } catch {
    return 0;
  }
}

function writeLocalIncrement(count: number, sinceUpdatedAt: number): void {
  try {
    localStorage.setItem(LOCAL_INCREMENT_KEY, JSON.stringify({ count, sinceUpdatedAt }));
  } catch {
    return;
  }
}

function combine(base: RemoteBase | null): Stats | null {
  if (!base) return null;
  const increment = readLocalIncrement(base.updatedAt);
  return { total: base.total + increment, last24h: base.last24h + increment };
}

export function getCachedDisplayStats(): Stats | null {
  return combine(readRemoteBase());
}

export async function refreshDisplayStats(): Promise<Stats | null> {
  if (!STATS_URL) return getCachedDisplayStats();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(STATS_URL, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return getCachedDisplayStats();
    const fresh = (await response.json()) as RemoteBase;
    const existing = readRemoteBase();
    if (!existing || fresh.updatedAt > existing.updatedAt) {
      writeRemoteBase(fresh);
      writeLocalIncrement(0, fresh.updatedAt);
      return combine(fresh);
    }
    return combine(existing);
  } catch {
    return getCachedDisplayStats();
  } finally {
    clearTimeout(timer);
  }
}

export function noteLocalTranslation(): void {
  const base = readRemoteBase();
  const sinceUpdatedAt = base?.updatedAt ?? 0;
  writeLocalIncrement(readLocalIncrement(sinceUpdatedAt) + 1, sinceUpdatedAt);
}
