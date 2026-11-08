import { prioritizeBuildFiles } from "./buildChannel";

const MIN_SEGMENTS_FOR_SECTION_PRIORITY = 2;

function routePrefixes(): string[] {
  const base = import.meta.env.BASE_URL;
  const relative = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : location.pathname.replace(/^\/+/, "");
  const segments = relative.split("/").filter(Boolean);
  if (segments.length < MIN_SEGMENTS_FOR_SECTION_PRIORITY) return [];
  const exact = `${segments.join("/")}/`;
  const section = `${segments.slice(0, MIN_SEGMENTS_FOR_SECTION_PRIORITY).join("/")}/`;
  return [...new Set([exact, section])];
}

export function announceNavigation(): void {
  void prioritizeBuildFiles(routePrefixes()).catch(() => undefined);
}
