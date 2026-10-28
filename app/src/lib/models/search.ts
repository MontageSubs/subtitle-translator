import type { ModelView } from "./manager";

export function filterModelViews(views: readonly ModelView[], query: string): ModelView[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...views];
  return views.filter(({ manifest }) => [manifest.repository, manifest.author, ...manifest.languages].some((field) => field.toLowerCase().includes(needle)));
}
