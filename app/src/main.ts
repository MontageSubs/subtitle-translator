import "./style.css";
import { startRouter, onRouteChange, Route, PageId } from './router/router';
import { mountShell } from "./shell";
import { applyPageMeta } from './config/head';
import { showUpdateToast } from "./components/updateToast";
import { initServiceWorker } from './utils/swUpdate';
import { initUnsavedChangesListener } from "./lib/unsavedChanges";
import { updateCaptchaScrollLock } from "./api/workerClient";

initUnsavedChangesListener();

type PageModule = { mount: (container: HTMLElement, signal: AbortSignal) => void | Promise<void> };

const PAGE_LOADERS: Record<PageId, () => Promise<PageModule>> = {
  nmt: () => import("./pages/nmt"),
  history: () => import("./pages/history"),
  discussions: () => import("./pages/discussions"),
  docs: () => import("./pages/docs"),
  contribute: () => import("./pages/contribute"),
  apps: () => import("./pages/apps"),
  about: () => import("./pages/about"),
};

const root = document.getElementById("app")!;
const shell = mountShell(root);

const pageContainers = new Map<PageId, HTMLElement>();
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

  pageContainers.forEach((containerEl, pageId) => {
    containerEl.style.display = pageId === route.page ? "block" : "none";
  });
  updateCaptchaScrollLock();

  let targetEl = pageContainers.get(route.page);
  const isFirstMount = !targetEl;

  if (!targetEl) {
    targetEl = document.createElement("div");
    targetEl.className = `page-container page-container--${route.page}`;
    shell.outlet.appendChild(targetEl);
    pageContainers.set(route.page, targetEl);
  }

  targetEl.style.display = "block";

  const page = await PAGE_LOADERS[route.page]();
  if (controller.signal.aborted) return;

  if (isFirstMount) {
    await page.mount(targetEl, controller.signal);
  } else {
    const pageMod = page as any;
    if (typeof pageMod.onRouteRevisit === "function") {
      pageMod.onRouteRevisit(targetEl);
    } else if (route.page !== "discussions" && route.page !== "nmt") {
      await page.mount(targetEl, controller.signal);
    }
  }

  if (!hasPrefetched) {
    hasPrefetched = true;
    prefetchOtherPages(route.page);
  }
}

onRouteChange(renderRoute);
startRouter();

initServiceWorker({ onNeedRefresh: showUpdateToast });
