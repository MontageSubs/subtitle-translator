import { terminateWorker } from "./terminateWorker";
import { workersFunctional } from "./workerProbe";
import type { DetectionRequest, DetectionResponse, DetectionResult } from "./detectProtocol";

type Results = (DetectionResult | null)[];

interface Channel {
  worker: Worker;
  calls: Map<number, { resolve(results: Results): void; reject(error: unknown): void }>;
  terminationTimer: number;
}

const IDLE_TERMINATE_MS = 60_000;
const DETECTION_DEADLINE_MS = 8_000;

let channel: Channel | undefined;
let workerDistrusted = false;
let nextId = 0;

function closeChannel(error: unknown): void {
  if (!channel) return;
  const closing = channel;
  channel = undefined;
  window.clearTimeout(closing.terminationTimer);
  closing.calls.forEach(({ reject }) => reject(error));
  terminateWorker(closing.worker);
}

function armTermination(current: Channel): void {
  window.clearTimeout(current.terminationTimer);
  current.terminationTimer = window.setTimeout(() => closeChannel(new Error("detector idle")), IDLE_TERMINATE_MS);
}

function openChannel(): Channel {
  if (channel) return channel;
  const worker = new Worker(new URL("./detectWorker.ts", import.meta.url), { type: "module" });
  const opened: Channel = { worker, calls: new Map(), terminationTimer: 0 };
  worker.onmessage = ({ data }: MessageEvent<DetectionResponse>) => {
    opened.calls.get(data.id)?.resolve(data.results);
    opened.calls.delete(data.id);
    if (!opened.calls.size) armTermination(opened);
  };
  worker.onerror = () => closeChannel(new Error("detector worker failed"));
  channel = opened;
  armTermination(opened);
  return opened;
}

export function warmDetectorChannel(): void {
  try {
    openChannel();
  } catch {
    channel = undefined;
  }
}

export async function detectInWorker(texts: readonly string[]): Promise<Results> {
  if (workerDistrusted || !(await workersFunctional())) throw new Error("workers unavailable");
  return new Promise((resolve, reject) => {
    const deadline = window.setTimeout(() => {
      workerDistrusted = true;
      closeChannel(new Error("detector did not respond"));
    }, DETECTION_DEADLINE_MS);
    const clearingDeadline = <T>(settle: (value: T) => void) => (value: T): void => {
      window.clearTimeout(deadline);
      settle(value);
    };
    try {
      const current = openChannel();
      window.clearTimeout(current.terminationTimer);
      const id = nextId++;
      current.calls.set(id, { resolve: clearingDeadline(resolve), reject: clearingDeadline(reject) });
      current.worker.postMessage({ id, texts: [...texts] } satisfies DetectionRequest);
    } catch (error) {
      window.clearTimeout(deadline);
      reject(error);
    }
  });
}
