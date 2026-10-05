import { PageId, Route } from "./router";

export interface PageModule {
  mount(container: HTMLElement, signal: AbortSignal): void | Promise<void>;
  onRouteRevisit?(container: HTMLElement): void;
}

export type PageLoaders = Record<PageId, () => Promise<PageModule>>;

export interface PageHost {
  show(route: Route): Promise<void>;
}

const PREFETCH_FALLBACK_DELAY_MS = 200;

export function createPageHost(outlet: HTMLElement, loaders: PageLoaders, hooks: { onFailure(): void; onShown(): void }): PageHost {
  const containers = new Map<PageId, HTMLElement>();
  let activeRun: AbortController | null = null;
  let prefetched = false;

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

  function prefetchOthers(activePage: PageId): void {
    if (prefetched) return;
    prefetched = true;
    const schedule = window.requestIdleCallback ?? ((task: () => void) => setTimeout(task, PREFETCH_FALLBACK_DELAY_MS));
    schedule(() => {
      (Object.keys(loaders) as PageId[]).filter((page) => page !== activePage).forEach((page) => { loaders[page]().catch(() => {}); });
    });
  }

  async function show(route: Route): Promise<void> {
    activeRun?.abort();
    const run = new AbortController();
    activeRun = run;

    containers.forEach((container, page) => { container.style.display = page === route.page ? "block" : "none"; });
    const container = containerFor(route.page);
    container.style.display = "block";

    try {
      const page = await loaders[route.page]();
      if (run.signal.aborted) return;
      if (container.childElementCount === 0) {
        await page.mount(container, run.signal);
        if (!run.signal.aborted) discardPrerenderedContent();
      } else if (page.onRouteRevisit) {
        page.onRouteRevisit(container);
      } else {
        await page.mount(container, run.signal);
      }
    } catch (error) {
      if (run.signal.aborted) return;
      hooks.onFailure();
      throw error;
    }

    hooks.onShown();
    prefetchOthers(route.page);
  }

  return { show };
}
