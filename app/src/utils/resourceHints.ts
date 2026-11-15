import { STATS_URL, STATUS_API_URL, WORKER_URL } from "../config/environment";

const originOf = (url: string): string | null => {
  try {
    return url ? new URL(url, location.origin).origin : null;
  } catch {
    return null;
  }
};

function addHint(origin: string | null): void {
  if (!origin || origin === location.origin) return;
  if (document.head.querySelector(`link[rel="dns-prefetch"][href="${origin}"]`)) return;
  const link = document.createElement("link");
  link.rel = "dns-prefetch";
  link.href = origin;
  document.head.append(link);
}

export function installResourceHints(): void {
  addHint(originOf(STATS_URL));
  addHint(originOf(WORKER_URL));
  addHint(originOf(STATUS_API_URL));
  const [primaryModelSource] = __MODEL_SOURCES__;
  addHint(originOf(primaryModelSource ?? ""));
}
