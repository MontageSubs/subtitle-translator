import { LocaleCode, isLocaleCode, detectPreferredLocale, loadLocale, setLocale } from '../i18n';
import { LOCALE_SWITCH_SELECTOR } from '../config/localeSwitch';
import { PAGE_IDS, PageId } from "./router.pages";
import { NESTED_CHANNEL_PATHS } from '../config/channel';
import { reconcileVisit } from '../i18n/localePreference';
import { HOME_PAGE_ID, routePath, pageRoutePath } from '../render/paths';


export type { PageId } from "./router.pages";
const DEFAULT_PAGE: PageId = HOME_PAGE_ID;

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
  return pageRoutePath(basePath(), locale, page, rest);
}

function parseSegments(segments: string[]): { locale: LocaleCode | null; page: PageId; rest: string[] } {
  const first = segments[0];
  if (first && isLocaleCode(first)) {
    const second = segments[1];
    return { locale: first, page: second && isPageId(second) ? second : DEFAULT_PAGE, rest: segments.slice(2) };
  }
  if (first && isPageId(first)) return { locale: null, page: first, rest: segments.slice(1) };
  return { locale: null, page: DEFAULT_PAGE, rest: [] };
}

export function pageOfLink(anchor: HTMLAnchorElement | null): PageId | null {
  if (!anchor || !isInternalLink(anchor)) return null;
  const base = basePath();
  const path = anchor.pathname.startsWith(base) ? anchor.pathname.slice(base.length) : anchor.pathname;
  return parseSegments(path.split("/").filter(Boolean)).page;
}

function resolveRoute(): { route: Route; canonicalPath: string | null } {
  const segments = segmentsFromLocation();
  const parsed = parseSegments(segments);
  const locale = parsed.locale ?? detectPreferredLocale();
  const { page, rest: rawRest } = parsed;

  const canonicalRest = page === "docs" ? rawRest.slice(0, 1) : [];
  const canonical = buildPath(locale, page, canonicalRest);
  const current = routePath(basePath(), segments);
  const needsCanonicalRedirect = canonical !== current;

  return { route: { locale, page, rest: canonicalRest }, canonicalPath: needsCanonicalRedirect ? canonical : null };
}

export interface NavigationIntent {
  resetScroll: boolean;
}

const listeners = new Set<(route: Route, intent: NavigationIntent) => void>();
let pendingScrollReset = false;
let currentRoute: Route | null = null;

export function getRoute(): Route {
  if (!currentRoute) throw new Error("router has not started");
  return currentRoute;
}

let latestNavigation = 0;
let previousPage: PageId | null = null;

export const previousPageId = (): PageId | null => previousPage;

async function dispatch(): Promise<void> {
  const navigation = ++latestNavigation;
  const { route, canonicalPath } = resolveRoute();
  const resetScroll = pendingScrollReset;
  pendingScrollReset = false;
  if (canonicalPath) {
    history.replaceState(null, "", canonicalPath + location.search + location.hash);
  }
  if (!currentRoute) {
    const upgraded = reconcileVisit(route.locale);
    if (upgraded) {
      location.replace(buildPath(upgraded, route.page, route.rest) + location.search + location.hash);
      return;
    }
  }
  if (currentRoute && route.locale !== currentRoute.locale) {
    location.reload();
    return;
  }
  await loadLocale(route.locale);
  if (navigation !== latestNavigation) return;
  if (currentRoute && currentRoute.page !== route.page) previousPage = currentRoute.page;
  currentRoute = route;
  setLocale(route.locale);
  listeners.forEach((fn) => fn(route, { resetScroll }));
}

export function onRouteChange(fn: (route: Route, intent: NavigationIntent) => void): void {
  listeners.add(fn);
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (options.replace) history.replaceState(null, "", path);
  else {
    history.pushState(null, "", path);
    pendingScrollReset = true;
  }
  dispatch();
}


function isInternalLink(anchor: HTMLAnchorElement): boolean {
  return anchor.origin === location.origin && anchor.pathname.startsWith(basePath()) && !NESTED_CHANNEL_PATHS.some((path) => anchor.pathname.startsWith(path));
}

export function startRouter(): Promise<void> {
  window.addEventListener("popstate", dispatch);
  document.addEventListener("click", (event) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || !isInternalLink(anchor) || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (anchor.matches(LOCALE_SWITCH_SELECTOR)) return;
    if (anchor.target === "_blank" || (anchor.hash && anchor.pathname === location.pathname)) return;
    event.preventDefault();
    navigate(anchor.pathname + anchor.search + anchor.hash);
  });
  return dispatch();
}
