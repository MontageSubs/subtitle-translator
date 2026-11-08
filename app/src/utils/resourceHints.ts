import { STATS_URL, STATUS_API_URL, WORKER_URL } from "../config/environment";

type HintRelation = "preconnect" | "dns-prefetch";

const originOf = (url: string): string | null => {
  try {
    return url ? new URL(url, location.origin).origin : null;
  } catch {
    return null;
  }
};

function addHint(relation: HintRelation, origin: string | null): void {
  if (!origin || origin === location.origin) return;
  if (document.head.querySelector(`link[rel="${relation}"][href="${origin}"]`)) return;
  const link = document.createElement("link");
  link.rel = relation;
  link.href = origin;
  if (relation === "preconnect") link.crossOrigin = "anonymous";
  document.head.append(link);
}

export function installResourceHints(): void {
  addHint("preconnect", originOf(STATS_URL));
  addHint("dns-prefetch", originOf(WORKER_URL));
  addHint("dns-prefetch", originOf(STATUS_API_URL));
  const [primaryModelSource] = __MODEL_SOURCES__;
  addHint("dns-prefetch", originOf(primaryModelSource ?? ""));
}
