import { APP_VERSION } from "../config/compat";
import { isVersionAtLeast } from "../utils/version";
import { isControlledByOwnWorker, latestBuild, retireServiceWorkers, runningBuild, supportsOfflineCache, type BuildInfo } from "./buildChannel";
import { clearRequiredVersion, readRequiredVersion, rememberRequiredVersion } from "./requirement";
import { runUnlessConserving } from "./resourceSaving";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const IDLE_DEADLINE_MS = 5 * 1000;
const PURSUIT_INTERVAL_MS = 20 * 1000;
const PURSUIT_RETRIES = 6;

interface Inspection {
  latest?: BuildInfo;
  update?: BuildInfo;
}

let knownBuild: Promise<BuildInfo | undefined> = Promise.resolve(undefined);
let onUpdateAvailable: (() => void) | undefined;
let announcedDigest: string | undefined;
let pursuing = false;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function inspectBuilds(): Promise<Inspection> {
  const known = await knownBuild;
  const latest = await latestBuild();
  knownBuild = Promise.resolve(known ?? latest);
  return { latest, update: known && latest && latest.digest !== known.digest ? latest : undefined };
}

function announce({ update }: Inspection): void {
  if (!update || update.digest === announcedDigest) return;
  announcedDigest = update.digest;
  onUpdateAvailable?.();
}

export async function checkForUpdate(): Promise<boolean> {
  const { update } = await inspectBuilds();
  if (update) announcedDigest = update.digest;
  return update !== undefined;
}

export async function announceUpdateIfAvailable(): Promise<void> {
  announce(await inspectBuilds());
}

async function pursueRequiredVersion(): Promise<void> {
  if (pursuing) return;
  pursuing = true;
  try {
    for (let attempt = 0; attempt <= PURSUIT_RETRIES; attempt++) {
      if (attempt) await sleep(PURSUIT_INTERVAL_MS);
      const required = readRequiredVersion();
      if (!required) return;
      const inspection = await inspectBuilds();
      announce(inspection);
      if (isVersionAtLeast(inspection.latest?.version, required)) return;
    }
  } finally {
    pursuing = false;
  }
}

const reported = new Set<string>();

function reportOnce(key: string, message: string): void {
  if (reported.has(key)) return;
  reported.add(key);
  console.warn(message);
  void announceUpdateIfAvailable();
}

export function reportMinClientVersion(source: string, minVersion: unknown): void {
  if (!isVersionAtLeast(APP_VERSION, minVersion)) reportOnce(`${source}@${minVersion}`, `[${source}] requires app ${minVersion}, running ${APP_VERSION}`);
}

export function reportUnreadableFormat(source: string): void {
  reportOnce(`${source}:format`, `[${source}] unrecognized data format`);
}

export function demandClientVersion(minVersion: string | undefined): void {
  if (!minVersion || isVersionAtLeast(APP_VERSION, minVersion)) return;
  rememberRequiredVersion(minVersion);
  void pursueRequiredVersion();
}

function settlePendingRequirement(): boolean {
  const required = readRequiredVersion();
  if (!required) return false;
  if (!isVersionAtLeast(APP_VERSION, required)) return true;
  clearRequiredVersion();
  return false;
}

function whenIdle(task: () => void): void {
  if ("requestIdleCallback" in window) window.requestIdleCallback(task, { timeout: IDLE_DEADLINE_MS });
  else setTimeout(task, IDLE_DEADLINE_MS);
}

function scheduleChecks(firstDelayMs: number): void {
  let dueAt = Date.now() + firstDelayMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let routine = false;
  const arm = () => {
    clearTimeout(timer);
    if (document.visibilityState !== "visible") return;
    timer = setTimeout(() => whenIdle(run), Math.max(0, dueAt - Date.now()));
  };
  const run = async () => {
    dueAt = Date.now() + CHECK_INTERVAL_MS;
    await (routine ? runUnlessConserving(announceUpdateIfAvailable) : announceUpdateIfAvailable());
    routine = true;
    arm();
  };
  document.addEventListener("visibilitychange", arm);
  arm();
}

export function initUpdateWatcher(announceUpdate: () => void): void {
  if (!import.meta.env.PROD) return;
  if (!supportsOfflineCache()) {
    void retireServiceWorkers();
    return;
  }
  onUpdateAvailable = announceUpdate;
  const base = import.meta.env.BASE_URL;
  if (isControlledByOwnWorker()) knownBuild = runningBuild();
  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .then(() => {
      const pending = settlePendingRequirement();
      if (pending) void pursueRequiredVersion();
      scheduleChecks(pending ? CHECK_INTERVAL_MS : 0);
    })
    .catch(() => undefined);
}
