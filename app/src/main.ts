import "./style.css";
import { startRouter, onRouteChange, Route, PageId } from "./router";
import { mountShell } from "./shell";
import { showUpdateToast, showOfflineReadyToast } from "./components/updateToast";
import { initServiceWorker } from "./core/swUpdate";

type PageModule = { mount: (container: HTMLElement) => void | Promise<void> };

const PAGE_LOADERS: Record<PageId, () => Promise<PageModule>> = {
  nmt: () => import("./pages/nmt"),
  docs: () => import("./pages/docs"),
  about: () => import("./pages/about"),
  contributors: () => import("./pages/contributors"),
  discussions: () => import("./pages/discussions"),
};

const root = document.getElementById("app")!;
const shell = mountShell(root);

let renderToken = 0;
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
  const token = ++renderToken;
  shell.update(route);
  const page = await PAGE_LOADERS[route.page]();
  if (token !== renderToken) return;
  page.mount(shell.outlet);
  if (!hasPrefetched) {
    hasPrefetched = true;
    prefetchOtherPages(route.page);
  }
}

onRouteChange(renderRoute);
startRouter();

initServiceWorker({ onNeedRefresh: showUpdateToast, onOfflineReady: showOfflineReadyToast });
