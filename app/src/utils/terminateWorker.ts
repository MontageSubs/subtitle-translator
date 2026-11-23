export function terminateWorker(worker: Worker | null | undefined): void {
  try {
    worker?.terminate();
  } catch {
    return;
  }
}
