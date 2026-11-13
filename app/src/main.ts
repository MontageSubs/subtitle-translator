import { getLocale } from "./i18n";
import { loadLocaleDocs } from "./lib/docs/localeDocs";
import { mountTouchViewportLock } from "./utils/viewportLock";
import "./utils/legacyStorageMigration";
import "./styles/index.css";
import { startRouter, onRouteChange } from "./router/router";
import { createPageHost, PageLoaders } from "./router/pageHost";
import { mountShell } from "./shell";
import { applyPageMeta } from "./config/head";
import { showUpdateToast, bindVersionCheck } from "./components/updateToast";
import { mountLocaleMenu } from "./components/localeMenu";
import { initUpdateWatcher } from "./update/updateWatcher";
import { announceNavigation } from "./update/navigationHints";
import { initUnsavedChangesListener } from "./lib/unsavedChanges";
import { bindChannelSwitch } from "./components/channelSwitch";
import { printBrandBanner } from "./utils/brandConsole";
import { installStaleChunkRecovery, recoverFromStaleChunk } from "./utils/staleChunkRecovery";
import { installInputDirection } from "./utils/inputDirection";
import { installTruncationTitles } from "./utils/truncationTitle";
import { installResourceHints } from "./utils/resourceHints";

const PAGE_LOADERS: PageLoaders = {
  translator: () => import("./pages/translator/translatorPage"),
  history: () => import("./pages/history/historyPage"),
  models: () => import("./pages/models/modelsPage"),
  discussions: () => import("./pages/discussions"),
  docs: () => import("./pages/docs"),
  contribute: () => import("./pages/staticPages").then((module) => module.staticPageModule("contribute")),
  tools: () => import("./pages/staticPages").then((module) => module.staticPageModule("tools")),
  about: () => import("./pages/staticPages").then((module) => module.staticPageModule("about")),
};

printBrandBanner();
initUnsavedChangesListener();
installStaleChunkRecovery();
installInputDirection();
installTruncationTitles();
installResourceHints();

mountTouchViewportLock();
const shell = mountShell(document.getElementById("app")!);
mountLocaleMenu();
const pageHost = createPageHost(shell.outlet, PAGE_LOADERS, {
  onFailure: recoverFromStaleChunk,
  prefetchOrder: ["docs", "history", "discussions", "contribute", "tools", "about", "models", "translator"],
  warmups: [() => loadLocaleDocs(getLocale())],
});

onRouteChange((route) => {
  shell.update(route);
  applyPageMeta(route.page);
  announceNavigation();
  return pageHost.show(route);
});
void startRouter();

initUpdateWatcher(showUpdateToast);
bindVersionCheck();
bindChannelSwitch();
