import { NavigationIntent, PageId, Route } from "./router";
import { t } from "../i18n";
import { loadQuietly } from "../utils/staleChunkRecovery";
import { revealHashTarget } from "../utils/dom";

interface PageModule {
  mount(container: HTMLElement, signal: AbortSignal): void | Promise<void>;
  onRouteRevisit?(container: HTMLElement): void;
}

interface PrefetchTask {
  page: PageId;
  isPageFetch: boolean;
  run: () => Promise<void>;
}

export type PageLoaders = Record<PageId, () => Promise<PageModule>>;

export interface PageHost {
  show(route: Route, intent: NavigationIntent): Promise<void>;
  expect(page: PageId): void;
}

const PREFETCH_FALLBACK_DELAY_MS = 200;
const PAGE_LOAD_TIMEOUT_MS = 12000;

function withTimeout<T>(task: Promise<T>): Promise<T> {
  let timer = 0;
  const expiry = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("page load timed out")), PAGE_LOAD_TIMEOUT_MS);
  });
  return Promise.race([task, expiry]).finally(() => window.clearTimeout(timer));
}

function renderLoadFailure(container: HTMLElement): void {
  const message = document.createElement("p");
  message.textContent = t("error.pageLoadFailed");
  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "action-pill";
  reload.textContent = t("update.reload");
  reload.addEventListener("click", () => location.reload());
  const notice = document.createElement("div");
  notice.className = "page-load-failure";
  notice.setAttribute("role", "alert");
  notice.append(message, reload);
  container.replaceChildren(notice);
  container.dataset.loadFailed = "true";
}

interface PageHostHooks {
  onFailure(): boolean;
  prefetchOrder: readonly PageId[];
  warmups: Readonly<Partial<Record<PageId, () => Promise<unknown>>>>;
}

type NetworkAwareNavigator = Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };

const SLOW_CONNECTION_TYPES = ["slow-2g", "2g"];
const PREFETCH_PAUSE_MS = 300;
const FULL_SPEED_LANES = 2;

function prefetchLanes(): number {
  const { connection } = navigator as NetworkAwareNavigator;
  if (!connection) return FULL_SPEED_LANES;
  if (connection.saveData || SLOW_CONNECTION_TYPES.includes(connection.effectiveType ?? "")) return 0;
  return connection.effectiveType === "3g" ? 1 : FULL_SPEED_LANES;
}

const afterWindowLoad = (): Promise<void> => new Promise((resolve) => {
  if (document.readyState === "complete") resolve();
  else window.addEventListener("load", () => resolve(), { once: true });
});

const pauseWhenIdle = (): Promise<void> => new Promise((resolve) => {
  if (window.requestIdleCallback) window.requestIdleCallback(() => resolve(), { timeout: PREFETCH_PAUSE_MS * 4 });
  else setTimeout(resolve, PREFETCH_PAUSE_MS);
});

export function createPageHost(outlet: HTMLElement, loaders: PageLoaders, hooks: PageHostHooks): PageHost {
  const containers = new Map<PageId, HTMLElement>();
  let activeRun: AbortController | null = null;
  let prefetched = false;
  let visiblePage: PageId | null = null;
  let foregroundIdle: Promise<void> = Promise.resolve();
  const queue: PrefetchTask[] = [];

  function containerFor(page: PageId): HTMLElement {
    let container = containers.get(page);
    if (!container) {
      container = document.createElement("div");
      container.className = `page-container page-container--${page}`;
      outlet.appendChild(container);
      containers.set(page, container);
    }
    return container;
  }

  function discardPrerenderedContent(): void {
    const known = new Set(containers.values());
    Array.from(outlet.children).filter((child) => !known.has(child as HTMLElement)).forEach((child) => child.remove());
  }

  function dropPageFetch(page: PageId): void {
    const index = queue.findIndex((task) => task.page === page && task.isPageFetch);
    if (index >= 0) queue.splice(index, 1);
  }

  function nextTask(): PrefetchTask | undefined {
    const index = queue.findIndex((task) => task.page === visiblePage);
    return queue.splice(Math.max(index, 0), 1)[0];
  }

  async function waitForForeground(): Promise<void> {
    for (let current = foregroundIdle; ; current = foregroundIdle) {
      await current;
      if (current === foregroundIdle) return;
    }
  }

  function buildQueue(withWarmups: boolean): void {
    hooks.prefetchOrder.forEach((page) => {
      if (page !== visiblePage) queue.push({ page, isPageFetch: true, run: async () => void (await loaders[page]()) });
      const warmup = withWarmups ? hooks.warmups[page] : undefined;
      if (warmup) queue.push({ page, isPageFetch: false, run: async () => void (await warmup()) });
    });
  }

  function prefetchOthers(): void {
    if (prefetched) return;
    prefetched = true;
    const schedule = window.requestIdleCallback ?? ((task: () => void) => setTimeout(task, PREFETCH_FALLBACK_DELAY_MS));
    void afterWindowLoad().then(() => schedule(() => {
      const lanes = prefetchLanes();
      buildQueue(lanes >= FULL_SPEED_LANES);
      const lane = async (): Promise<void> => {
        for (;;) {
          await waitForForeground();
          const task = nextTask();
          if (!task) return;
          await loadQuietly(task.run).catch(() => {});
          await pauseWhenIdle();
        }
      };
      void Promise.all(Array.from({ length: lanes }, lane));
    }));
  }

  function expect(page: PageId): void {
    if (page === visiblePage) return;
    dropPageFetch(page);
    void loadQuietly(loaders[page]).catch(() => {});
  }

  async function show(route: Route, intent: NavigationIntent): Promise<void> {
    activeRun?.abort();
    const run = new AbortController();
    activeRun = run;
    visiblePage = route.page;
    dropPageFetch(route.page);
    let releaseForeground = (): void => {};
    foregroundIdle = new Promise<void>((resolve) => { releaseForeground = resolve; });

    try {
      const swappingPrerender = containers.size === 0 && outlet.childElementCount > 0;
      containers.forEach((container, page) => { container.style.display = page === route.page ? "block" : "none"; });
      const container = containerFor(route.page);
      container.style.display = "block";
      container.classList.toggle("page-container--pending", swappingPrerender);
      if (intent.resetScroll) window.scrollTo({ top: 0, left: 0, behavior: "instant" });

      if (container.dataset.loadFailed) {
        container.replaceChildren();
        delete container.dataset.loadFailed;
      }

      try {
        const page = await withTimeout(loaders[route.page]());
        if (run.signal.aborted) return;
        if (container.childElementCount === 0) {
          await page.mount(container, run.signal);
          if (!run.signal.aborted) {
            container.classList.remove("page-container--pending");
            discardPrerenderedContent();
          }
        } else if (page.onRouteRevisit) {
          page.onRouteRevisit(container);
        } else {
          await page.mount(container, run.signal);
        }
      } catch (error) {
        if (run.signal.aborted) return;
        if (!hooks.onFailure()) renderLoadFailure(container);
        throw error;
      }

      revealHashTarget();
      prefetchOthers();
    } finally {
      releaseForeground();
    }
  }

  return { show, expect };
}
