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

export const HOME_PAGE_ID = "nmt";

export function pageRoutePath(base: string, locale: string, page: string, rest: (string | undefined)[] = []): string {
  const pageSegment = page === HOME_PAGE_ID ? undefined : page;
  return routePath(base, [locale, pageSegment, ...rest]);
}
