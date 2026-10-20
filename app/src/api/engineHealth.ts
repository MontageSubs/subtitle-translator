import { activeIncidents, StatusSnapshot } from "./statusApi";

const ENGINE_COMPONENTS: Readonly<Record<string, readonly string[]>> = {
  "google-nmt-pa": ["google_pa", "google_v2"],
  "microsoft-nmt-edge": ["microsoft_translator"],
};

type Listener = (flagged: ReadonlySet<string>) => void;

const listeners = new Set<Listener>();
let flagged: ReadonlySet<string> = new Set();

const componentIdsOf = (componentId: string | string[]): string[] => (Array.isArray(componentId) ? componentId : [componentId]);

function flaggedEngines(snapshot: StatusSnapshot): Set<string> {
  const affected = new Set([
    ...snapshot.components.filter(({ status }) => status !== "operational").map(({ id }) => id),
    ...activeIncidents(snapshot).flatMap((incident) => componentIdsOf(incident.componentId)),
  ]);
  return new Set(Object.keys(ENGINE_COMPONENTS).filter((engine) => ENGINE_COMPONENTS[engine].some((id) => affected.has(id))));
}

const sameMembers = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((item) => b.has(item));

export function publishEngineHealth(snapshot: StatusSnapshot): void {
  const next = flaggedEngines(snapshot);
  if (sameMembers(flagged, next)) return;
  flagged = next;
  listeners.forEach((listener) => listener(flagged));
}

export function subscribeEngineHealth(listener: Listener): () => void {
  listeners.add(listener);
  listener(flagged);
  return () => listeners.delete(listener);
}
