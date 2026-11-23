import { terminateWorker } from "./terminateWorker";

const PROBE_TIMEOUT_MS = 4000;

let verdict: Promise<boolean> | null = null;

function probeWorker(): Promise<boolean> {
  if (typeof Worker === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    let probe: Worker | null = null;
    const finish = (functional: boolean): void => {
      clearTimeout(timer);
      resolve(functional);
      terminateWorker(probe);
    };
    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    try {
      probe = new Worker(new URL("./workerProbe.worker.ts", import.meta.url), { type: "module" });
      probe.onmessage = () => finish(true);
      probe.onerror = () => finish(false);
      probe.postMessage("ping");
    } catch {
      finish(false);
    }
  });
}

export const workersFunctional = (): Promise<boolean> => (verdict ??= probeWorker());
