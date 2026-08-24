export function joinPath(base: string, segments: (string | undefined)[]): string {
  const cleanBase = base.replace(/\/$/, "");
  const cleanSegments = segments.filter((segment): segment is string => Boolean(segment));
  return [cleanBase, ...cleanSegments].join("/").replace(/\/{2,}/g, "/");
}

export function routePath(base: string, segments: (string | undefined)[]): string {
  return `${joinPath(base, segments)}/`;
}
