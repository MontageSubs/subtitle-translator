import { CHANNEL } from "../config/channel";

const REQUEST_TIMEOUT_MS = 30 * 1000;

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

async function exchange(type: BuildRequest): Promise<BuildInfo | undefined> {
  const active = await ownActiveWorker();
  if (!active) return undefined;
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = ({ data }) => resolve(data.digest ? { digest: data.digest, version: data.version } : undefined);
    active.postMessage({ type }, [port2]);
  });
}

function request(type: BuildRequest): Promise<BuildInfo | undefined> {
  if (!supportsOfflineCache()) return Promise.resolve(undefined);
  const timeout = new Promise<undefined>((resolve) => setTimeout(resolve, REQUEST_TIMEOUT_MS, undefined));
  return Promise.race([exchange(type), timeout]);
}

export const runningBuild = (): Promise<BuildInfo | undefined> => request("status");

export const latestBuild = (): Promise<BuildInfo | undefined> => request("check");
