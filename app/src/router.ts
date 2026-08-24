import { LocaleCode, LOCALES, isLocaleCode, detectPreferredLocale, setLocale } from "./i18n";
import { PAGE_IDS, PageId } from "./router.pages";
import { joinPath } from "./render/paths";

export { PAGE_IDS } from "./router.pages";
export type { PageId } from "./router.pages";
const DEFAULT_PAGE: PageId = "nmt";

export interface Route {
  locale: LocaleCode;
  page: PageId;
  rest: string[];
}

function isPageId(value: string): value is PageId {
  return (PAGE_IDS as readonly string[]).includes(value);
}

function basePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

function segmentsFromLocation(): string[] {
  const base = basePath();
  const path = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : location.pathname;
  return path.split("/").filter(Boolean);
}

export function buildPath(locale: LocaleCode, page: PageId, rest: string[] = []): string {
  return joinPath(basePath(), [locale, page, ...rest]);
}

function resolveRoute(): { route: Route; canonicalPath: string | null } {
  const segments = segmentsFromLocation();
  const [localeSegment, pageSegment, ...rest] = segments;

  const locale = localeSegment && isLocaleCode(localeSegment) ? localeSegment : detectPreferredLocale();
  const page = pageSegment && isPageId(pageSegment) ? pageSegment : DEFAULT_PAGE;

  const needsCanonicalRedirect = localeSegment !== locale || pageSegment !== page;
  return { route: { locale, page, rest }, canonicalPath: needsCanonicalRedirect ? buildPath(locale, page, rest) : null };
}

const listeners = new Set<(route: Route) => void>();
let currentRoute: Route | null = null;

export function getRoute(): Route {
  if (!currentRoute) throw new Error("router has not started");
  return currentRoute;
}

function dispatch(): void {
  const { route, canonicalPath } = resolveRoute();
  if (canonicalPath) {
    history.replaceState(null, "", canonicalPath);
  }
  currentRoute = route;
  setLocale(route.locale);
  listeners.forEach((fn) => fn(route));
}

export function onRouteChange(fn: (route: Route) => void): void {
  listeners.add(fn);
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (options.replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  dispatch();
}

export function pathFor(page: PageId, rest: string[] = []): string {
  const route = getRoute();
  return buildPath(route.locale, page, rest);
}

function isInternalLink(anchor: HTMLAnchorElement): boolean {
  return anchor.origin === location.origin && anchor.pathname.startsWith(basePath());
}

export function startRouter(): void {
  dispatch();
  window.addEventListener("popstate", dispatch);
  document.addEventListener("click", (event) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || !isInternalLink(anchor) || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(anchor.pathname);
  });
}

export const ALL_LOCALES = LOCALES;
