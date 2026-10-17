import { MIN_WORKER_VERSION } from "../../config/compat";
import { isVersionAtLeast } from "../../utils/version";
import { WorkerRequestError } from "./errors";

export function assertWorkerCompatible(workerVersion: unknown): void {
  if (!isVersionAtLeast(workerVersion, MIN_WORKER_VERSION)) throw new WorkerRequestError("worker_outdated", { code: "worker_outdated" });
}
