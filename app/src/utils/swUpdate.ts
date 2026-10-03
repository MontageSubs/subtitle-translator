const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_GRACE_MS = 15 * 1000;
const REQUEST_TIMEOUT_MS = 30 * 1000;

type WorkerRequest = "status" | "check";

let knownDigest: Promise<string | undefined> = Promise.resolve(undefined);

async function request(type: WorkerRequest): Promise<string | undefined> {
  const worker = (await navigator.serviceWorker?.getRegistration())?.active;
  if (!worker) return undefined;
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = (event) => resolve(event.data.digest);
    setTimeout(resolve, REQUEST_TIMEOUT_MS, undefined);
    worker.postMessage({ type }, [port2]);
  });
}

export async function checkForUpdate(): Promise<boolean> {
  const known = await knownDigest;
  const latest = await request("check");
  knownDigest = Promise.resolve(known ?? latest);
  return known !== undefined && latest !== undefined && latest !== known;
}

function scheduleChecks(onUpdateAvailable: () => void): void {
  let notified = false;
  let dueAt = Date.now() + STARTUP_GRACE_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    if (notified || document.visibilityState !== "visible") return;
    timer = setTimeout(run, Math.max(0, dueAt - Date.now()));
  };
  const run = async () => {
    dueAt = Date.now() + CHECK_INTERVAL_MS;
    notified = await checkForUpdate();
    if (notified) onUpdateAvailable();
    arm();
  };
  document.addEventListener("visibilitychange", arm);
  arm();
}

export function initServiceWorker(onUpdateAvailable: () => void): void {
  if (!import.meta.env.PROD || !navigator.serviceWorker) return;
  const base = import.meta.env.BASE_URL;
  if (navigator.serviceWorker.controller) knownDigest = request("status");
  navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then(() => scheduleChecks(onUpdateAvailable));
}
