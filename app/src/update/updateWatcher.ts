import { APP_VERSION } from "../config/compat";
import { isVersionAtLeast } from "../utils/version";
import { latestBuild, runningBuild, type BuildInfo } from "./buildChannel";
import { clearRequiredVersion, readRequiredVersion, rememberRequiredVersion } from "./requirement";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_GRACE_MS = 15 * 1000;
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

function scheduleChecks(firstDelayMs: number): void {
  let dueAt = Date.now() + firstDelayMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    if (document.visibilityState !== "visible") return;
    timer = setTimeout(run, Math.max(0, dueAt - Date.now()));
  };
  const run = async () => {
    dueAt = Date.now() + CHECK_INTERVAL_MS;
    await announceUpdateIfAvailable();
    arm();
  };
  document.addEventListener("visibilitychange", arm);
  arm();
}

export function initUpdateWatcher(announceUpdate: () => void): void {
  if (!import.meta.env.PROD || !navigator.serviceWorker) return;
  onUpdateAvailable = announceUpdate;
  const base = import.meta.env.BASE_URL;
  if (navigator.serviceWorker.controller) knownBuild = runningBuild();
  void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then(() => {
    const pending = settlePendingRequirement();
    if (pending) void pursueRequiredVersion();
    scheduleChecks(pending ? CHECK_INTERVAL_MS : STARTUP_GRACE_MS);
  });
}
