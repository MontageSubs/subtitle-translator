import "./style.css";
import { startRouter, onRouteChange, Route, PageId } from './router/router';
import { mountShell } from "./shell";
import { applyPageMeta } from './config/head';
import { showUpdateToast } from "./components/updateToast";
import { initServiceWorker } from './utils/swUpdate';
import { initUnsavedChangesListener } from "./lib/unsavedChanges";
import { updateCaptchaScrollLock } from "./api/workerClient";
import { printBrandBanner } from "./utils/brandConsole";

printBrandBanner();
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
      .forEach((page) => { PAGE_LOADERS[page]().catch(() => {}); });
  });
}

const RELOAD_GUARD_KEY = "subtitle-translator:chunk-reload";
const MAX_RELOAD_ATTEMPTS = 2;

function reloadForStaleChunk(): void {
  const attempts = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || "0");
  if (attempts >= MAX_RELOAD_ATTEMPTS) return;
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(attempts + 1));
  if (attempts === 0) {
    location.reload();
  } else {
    navigator.serviceWorker?.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    }).finally(() => location.reload());
  }
}

function isOwnAssetFailure(target: EventTarget | null): boolean {
  const url = target instanceof HTMLLinkElement ? target.href : target instanceof HTMLScriptElement ? target.src : "";
  if (!url) return false;
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadForStaleChunk();
});

window.addEventListener("error", (event) => {
  const target = event.target;
  const isStylesheet = target instanceof HTMLLinkElement && target.rel === "stylesheet";
  const isScript = target instanceof HTMLScriptElement;
  if ((isStylesheet || isScript) && isOwnAssetFailure(target)) reloadForStaleChunk();
}, true);

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

  try {
    const page = await PAGE_LOADERS[route.page]();
    if (controller.signal.aborted) return;

    if (isFirstMount) {
      await page.mount(targetEl, controller.signal);
      if (!controller.signal.aborted) {
        Array.from(shell.outlet.children).forEach((child) => {
          if (child !== targetEl) child.remove();
        });
      }
    } else {
      if (targetEl.childElementCount === 0) {
        pageContainers.delete(route.page);
        targetEl.remove();
        return renderRoute(route);
      }
      const pageMod = page as any;
      if (typeof pageMod.onRouteRevisit === "function") {
        pageMod.onRouteRevisit(targetEl);
      } else if (route.page !== "discussions" && route.page !== "nmt") {
        await page.mount(targetEl, controller.signal);
      }
    }
  } catch (e) {
    if (controller.signal.aborted) return;
    reloadForStaleChunk();
    throw e;
  }

  if (!hasPrefetched) {
    hasPrefetched = true;
    prefetchOtherPages(route.page);
  }
}

onRouteChange(renderRoute);
startRouter();

initServiceWorker({ onNeedRefresh: showUpdateToast });
