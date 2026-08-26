export function joinPath(base: string, segments: (string | undefined)[]): string {
  const cleanBase = base.replace(/\/$/, "");
  const cleanSegments = segments.filter((segment): segment is string => Boolean(segment));
  let joined = [cleanBase, ...cleanSegments].join("/").replace(/\/{2,}/g, "/");
  if (!joined.startsWith("/")) {
    joined = "/" + joined;
  }
  return joined;
}

export function routePath(base: string, segments: (string | undefined)[]): string {
  return `${joinPath(base, segments)}/`;
}
