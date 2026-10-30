import { PageId, Route } from "./router";
import { t } from "../i18n";
import { loadQuietly } from "../utils/staleChunkRecovery";

interface PageModule {
  mount(container: HTMLElement, signal: AbortSignal): void | Promise<void>;
  onRouteRevisit?(container: HTMLElement): void;
}

export type PageLoaders = Record<PageId, () => Promise<PageModule>>;

export interface PageHost {
  show(route: Route): Promise<void>;
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

export function createPageHost(outlet: HTMLElement, loaders: PageLoaders, hooks: { onFailure(): boolean }): PageHost {
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
      (Object.keys(loaders) as PageId[]).filter((page) => page !== activePage).forEach((page) => { loadQuietly(() => loaders[page]()).catch(() => {}); });
    });
  }

  async function show(route: Route): Promise<void> {
    activeRun?.abort();
    const run = new AbortController();
    activeRun = run;

    const swappingPrerender = containers.size === 0 && outlet.childElementCount > 0;
    containers.forEach((container, page) => { container.style.display = page === route.page ? "block" : "none"; });
    const container = containerFor(route.page);
    container.style.display = "block";
    container.classList.toggle("page-container--pending", swappingPrerender);

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

    prefetchOthers(route.page);
  }

  return { show };
}
