import "./style.css";
import { startRouter, onRouteChange, Route, PageId } from "./router";
import { mountShell } from "./shell";
import { applyPageMeta } from "./head";
import { showUpdateToast } from "./components/updateToast";
import { initServiceWorker } from "./core/swUpdate";

type PageModule = { mount: (container: HTMLElement, signal: AbortSignal) => void | Promise<void> };

const PAGE_LOADERS: Record<PageId, () => Promise<PageModule>> = {
  nmt: () => import("./pages/nmt"),
  history: () => import("./pages/history"),
  docs: () => import("./pages/docs"),
  about: () => import("./pages/about"),
  contributors: () => import("./pages/contributors"),
  discussions: () => import("./pages/discussions"),
};

const root = document.getElementById("app")!;
const shell = mountShell(root);

let activeController: AbortController | null = null;
let hasPrefetched = false;

function prefetchOtherPages(activePage: PageId): void {
  const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 200));
  idle(() => {
    (Object.keys(PAGE_LOADERS) as PageId[])
      .filter((page) => page !== activePage)
      .forEach((page) => { PAGE_LOADERS[page](); });
  });
}

async function renderRoute(route: Route): Promise<void> {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  shell.update(route);
  applyPageMeta(route.page);
  const page = await PAGE_LOADERS[route.page]();
  if (controller.signal.aborted) return;
  await page.mount(shell.outlet, controller.signal);
  if (!hasPrefetched) {
    hasPrefetched = true;
    prefetchOtherPages(route.page);
  }
}

onRouteChange(renderRoute);
startRouter();

initServiceWorker({ onNeedRefresh: showUpdateToast });
