const REQUEST_TIMEOUT_MS = 30 * 1000;

export interface BuildInfo {
  digest: string;
  version?: string;
}

type BuildRequest = "status" | "check";

async function request(type: BuildRequest): Promise<BuildInfo | undefined> {
  const worker = (await navigator.serviceWorker?.getRegistration())?.active;
  if (!worker) return undefined;
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = ({ data }) => resolve(data.digest ? { digest: data.digest, version: data.version } : undefined);
    setTimeout(resolve, REQUEST_TIMEOUT_MS, undefined);
    worker.postMessage({ type }, [port2]);
  });
}

export const runningBuild = (): Promise<BuildInfo | undefined> => request("status");

export const latestBuild = (): Promise<BuildInfo | undefined> => request("check");
