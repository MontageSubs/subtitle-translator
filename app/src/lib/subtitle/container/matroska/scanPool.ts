import { MatroskaReadError } from "./matroskaError";
import type { PauseGate } from "./pauseGate";
import type { ScanRequest } from "./scanProtocol";

const IDLE_TERMINATE_MS = 45_000;

const idleWorkers: Worker[] = [];
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function createWorker(): Worker {
  return new Worker(new URL("./scanWorker.ts", import.meta.url), { type: "module" });
}

function scheduleIdleShutdown(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => idleWorkers.splice(0).forEach((worker) => worker.terminate()), IDLE_TERMINATE_MS);
}

const pauseMessage = (paused: boolean): ScanRequest => ({ kind: "pause", paused });

export class WorkerLease {
  private readonly held: Worker[] = [];
  private readonly unsubscribe: () => void;

  constructor(private readonly gate: PauseGate, private readonly onFailure: (error: Error) => void) {
    clearTimeout(idleTimer);
    this.unsubscribe = gate.subscribe((paused) => this.held.forEach((worker) => worker.postMessage(pauseMessage(paused))));
  }

  acquire(): Worker {
    const worker = idleWorkers.pop() ?? createWorker();
    worker.onerror = () => this.onFailure(new MatroskaReadError("Scan worker failed"));
    if (this.gate.isPaused) worker.postMessage(pauseMessage(true));
    this.held.push(worker);
    return worker;
  }

  release(): void {
    this.unsubscribe();
    for (const worker of this.held.splice(0)) {
      worker.onerror = null;
      worker.onmessage = null;
      worker.postMessage(pauseMessage(false));
      idleWorkers.push(worker);
    }
    scheduleIdleShutdown();
  }

  discard(): void {
    this.unsubscribe();
    this.held.splice(0).forEach((worker) => worker.terminate());
    if (idleWorkers.length) scheduleIdleShutdown();
  }
}

export function warmScanWorker(): void {
  if (idleWorkers.length) return;
  idleWorkers.push(createWorker());
  scheduleIdleShutdown();
}
