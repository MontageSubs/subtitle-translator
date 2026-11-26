import { CHANNEL } from "../config/channel";

const REQUEST_TIMEOUT_MS = 30 * 1000;
const PATIENT_ATTEMPTS = 20;
const TIMED_OUT = Symbol("timed out");

const ownScope = (): string => new URL(CHANNEL.basePath, location.origin).href;

const ownScriptUrl = (): string => new URL(`${CHANNEL.basePath}sw.js`, location.origin).href;

export const supportsOfflineCache = (): boolean => "serviceWorker" in navigator && "caches" in window;

export const isControlledByOwnWorker = (): boolean => navigator.serviceWorker.controller?.scriptURL === ownScriptUrl();

async function ownRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  const registration = await navigator.serviceWorker.getRegistration(ownScope());
  return registration?.scope === ownScope() ? registration : undefined;
}

export async function retireServiceWorkers(): Promise<void> {
  const registration = await ownRegistration().catch(() => undefined);
  await registration?.unregister().catch(() => false);
}

export interface BuildInfo {
  digest: string;
  version?: string;
  groups?: string[];
  checkFailed: boolean;
}

type BuildRequest = "status" | "check";

function untilSettled(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const settle = () => {
      if (worker.state !== "activated" && worker.state !== "redundant") return;
      worker.removeEventListener("statechange", settle);
      resolve();
    };
    worker.addEventListener("statechange", settle);
    settle();
  });
}

async function ownActiveWorker(): Promise<ServiceWorker | undefined> {
  const registration = await ownRegistration();
  if (!registration) return undefined;
  const pending = registration.installing ?? registration.waiting;
  if (!registration.active && pending) await untilSettled(pending);
  return registration.active ?? undefined;
}

async function exchange(type: BuildRequest, groups?: readonly string[]): Promise<BuildInfo | undefined> {
  const active = await ownActiveWorker();
  if (!active) return undefined;
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = ({ data }) => resolve(data.digest ? { digest: data.digest, version: data.version, groups: data.groups, checkFailed: data.checkFailed === true } : undefined);
    active.postMessage({ type, groups }, [port2]);
  });
}

const timeoutAfter = (ms: number): Promise<typeof TIMED_OUT> => new Promise((resolve) => setTimeout(resolve, ms, TIMED_OUT));

async function request(type: BuildRequest, groups?: readonly string[], attempts = 1): Promise<BuildInfo | undefined> {
  if (!supportsOfflineCache()) return undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const outcome = await Promise.race([exchange(type, groups), timeoutAfter(REQUEST_TIMEOUT_MS)]);
    if (outcome !== TIMED_OUT) return outcome;
  }
  return undefined;
}

export function listenForBuildReady(onReady: () => void): void {
  navigator.serviceWorker.addEventListener("message", ({ data }) => {
    if (data?.type === "build-ready") onReady();
  });
}

export async function prefetchBuildGroups(groups: readonly string[]): Promise<void> {
  if (!supportsOfflineCache() || !groups.length) return;
  const active = await ownActiveWorker();
  active?.postMessage({ type: "prefetch", groups });
}

export async function prioritizeBuildFiles(prefixes: readonly string[]): Promise<void> {
  if (!supportsOfflineCache()) return;
  const active = await ownActiveWorker();
  active?.postMessage({ type: "prioritize", prefixes });
}

export const runningBuild = (): Promise<BuildInfo | undefined> => request("status");

export const latestBuild = (groups?: readonly string[], patient = false): Promise<BuildInfo | undefined> => request("check", groups, patient ? PATIENT_ATTEMPTS : 1);
