import "./style.css";
import { startRouter, onRouteChange } from "./router/router";
import { createPageHost, PageLoaders } from "./router/pageHost";
import { mountShell } from "./shell";
import { applyPageMeta } from "./config/head";
import { showUpdateToast, bindVersionCheck } from "./components/updateToast";
import { initServiceWorker } from "./utils/swUpdate";
import { initUnsavedChangesListener } from "./lib/unsavedChanges";
import { updateCaptchaScrollLock } from "./api/translation";
import { printBrandBanner } from "./utils/brandConsole";
import { installStaleChunkRecovery, markAppHealthy, recoverFromStaleChunk } from "./utils/staleChunkRecovery";

const PAGE_LOADERS: PageLoaders = {
  nmt: () => import("./pages/translator/translatorPage"),
  history: () => import("./pages/history/historyPage"),
  discussions: () => import("./pages/discussions"),
  docs: () => import("./pages/docs"),
  contribute: () => import("./pages/contribute"),
  apps: () => import("./pages/apps"),
  about: () => import("./pages/about"),
};

printBrandBanner();
initUnsavedChangesListener();
installStaleChunkRecovery();

const shell = mountShell(document.getElementById("app")!);
const pageHost = createPageHost(shell.outlet, PAGE_LOADERS, { onFailure: recoverFromStaleChunk, onShown: markAppHealthy });

onRouteChange((route) => {
  shell.update(route);
  applyPageMeta(route.page);
  updateCaptchaScrollLock();
  return pageHost.show(route);
});
startRouter();

initServiceWorker(showUpdateToast);
bindVersionCheck();
