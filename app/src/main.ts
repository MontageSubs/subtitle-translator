import "./utils/legacyStorageMigration";
import "./style.css";
import "./styles/interaction.css";
import { startRouter, onRouteChange } from "./router/router";
import { createPageHost, PageLoaders } from "./router/pageHost";
import { mountShell } from "./shell";
import { applyPageMeta } from "./config/head";
import { showUpdateToast, bindVersionCheck } from "./components/updateToast";
import { mountLocaleMenu } from "./components/localeMenu";
import { initUpdateWatcher } from "./update/updateWatcher";
import { initUnsavedChangesListener } from "./lib/unsavedChanges";
import { bindChannelSwitch } from "./components/channelSwitch";
import { printBrandBanner } from "./utils/brandConsole";
import { installStaleChunkRecovery, markAppHealthy, recoverFromStaleChunk } from "./utils/staleChunkRecovery";

const PAGE_LOADERS: PageLoaders = {
  translator: () => import("./pages/translator/translatorPage"),
  history: () => import("./pages/history/historyPage"),
  discussions: () => import("./pages/discussions"),
  docs: () => import("./pages/docs"),
  contribute: () => import("./pages/contribute"),
  tools: () => import("./pages/tools"),
  about: () => import("./pages/about"),
};

printBrandBanner();
initUnsavedChangesListener();
installStaleChunkRecovery();

const shell = mountShell(document.getElementById("app")!);
mountLocaleMenu();
const pageHost = createPageHost(shell.outlet, PAGE_LOADERS, { onFailure: recoverFromStaleChunk, onShown: markAppHealthy });

onRouteChange((route) => {
  shell.update(route);
  applyPageMeta(route.page);
  return pageHost.show(route);
});
void startRouter();

initUpdateWatcher(showUpdateToast);
bindVersionCheck();
bindChannelSwitch();
