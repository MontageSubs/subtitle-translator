const REQUEST_TIMEOUT_MS = 30 * 1000;

export const supportsOfflineCache = (): boolean => "serviceWorker" in navigator && "caches" in window;

export async function retireServiceWorkers(): Promise<void> {
  const registrations = (await navigator.serviceWorker?.getRegistrations().catch(() => [])) ?? [];
  await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
}

export interface BuildInfo {
  digest: string;
  version?: string;
}

type BuildRequest = "status" | "check";

async function exchange(type: BuildRequest): Promise<BuildInfo | undefined> {
  const { active } = await navigator.serviceWorker.ready;
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
