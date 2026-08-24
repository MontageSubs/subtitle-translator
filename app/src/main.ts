import "./style.css";
import { startRouter, onRouteChange, Route, PageId } from "./router";
import { mountShell } from "./shell";
import { applyPageMeta } from "./head";
import { showUpdateToast } from "./components/updateToast";
import { initServiceWorker } from "./core/swUpdate";
import * as nmt from "./pages/nmt";
import * as history from "./pages/history";
import * as docs from "./pages/docs";
import * as about from "./pages/about";
import * as contributors from "./pages/contributors";
import * as discussions from "./pages/discussions";

type PageModule = { mount: (container: HTMLElement, signal: AbortSignal) => void | Promise<void> };

const PAGE_MODULES: Record<PageId, PageModule> = { nmt, history, docs, about, contributors, discussions };

const root = document.getElementById("app")!;
const shell = mountShell(root);

let activeController: AbortController | null = null;

async function renderRoute(route: Route): Promise<void> {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  shell.update(route);
  applyPageMeta(route.page);
  await PAGE_MODULES[route.page].mount(shell.outlet, controller.signal);
}

onRouteChange(renderRoute);
startRouter();

initServiceWorker({ onNeedRefresh: showUpdateToast });
