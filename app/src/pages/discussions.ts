import { GISCUS_REPO, GISCUS_REPO_ID, GISCUS_CATEGORY, GISCUS_CATEGORY_ID } from "../giscusConfig";
import { setPageMeta } from "../head";
import { getLocale, t } from "../i18n";
import { GISCUS_LOCALES } from "../giscusLocale";

const GISCUS_ORIGIN = "https://giscus.app";
const GITHUB_DISCUSSIONS_URL = `https://github.com/${GISCUS_REPO}/discussions`;

function preferredTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function renderFallback(container: HTMLElement, onRetry: () => void): void {
  container.innerHTML = `
    <div class="discussions-fallback">
      <p class="discussions-fallback__desc">${t("discussions.fallback.desc")}</p>
      <div class="discussions-fallback__actions">
        <a class="primary" href="${GITHUB_DISCUSSIONS_URL}" target="_blank" rel="noopener">${t("discussions.fallback.action")}</a>
        <button type="button" class="secondary" id="discussions-retry-btn">${t("discussions.retry")}</button>
      </div>
    </div>
  `;
  container.querySelector<HTMLButtonElement>("#discussions-retry-btn")?.addEventListener("click", onRetry);
}

function mountGiscus(container: HTMLElement): void {
  const holder = document.createElement("div");
  holder.className = "discussions-embed";
  
  const loadingEl = document.createElement("div");
  loadingEl.className = "discussions-loading";
  loadingEl.innerHTML = `<div class="discussions-spinner" aria-hidden="true"></div><span>${t("discussions.loading")}</span>`;
  holder.appendChild(loadingEl);
  container.appendChild(holder);

  let loaded = false;
  const timeoutId = window.setTimeout(() => {
    if (!loaded) {
      holder.remove();
      renderFallback(container, () => {
        container.innerHTML = "";
        mountGiscus(container);
      });
    }
  }, 10000);

  const script = document.createElement("script");
  script.src = `${GISCUS_ORIGIN}/client.js`;
  script.async = true;
  script.crossOrigin = "anonymous";
  script.setAttribute("data-repo", GISCUS_REPO);
  script.setAttribute("data-repo-id", GISCUS_REPO_ID);
  script.setAttribute("data-category", GISCUS_CATEGORY);
  script.setAttribute("data-category-id", GISCUS_CATEGORY_ID);
  script.setAttribute("data-mapping", "pathname");
  script.setAttribute("data-strict", "0");
  script.setAttribute("data-reactions-enabled", "0");
  script.setAttribute("data-emit-metadata", "0");
  script.setAttribute("data-input-position", "bottom");
  script.setAttribute("data-theme", preferredTheme());
  script.setAttribute("data-lang", GISCUS_LOCALES[getLocale()]);

  script.onerror = () => {
    clearTimeout(timeoutId);
    if (!loaded) {
      holder.remove();
      renderFallback(container, () => {
        container.innerHTML = "";
        mountGiscus(container);
      });
    }
  };

  holder.appendChild(script);

  const messageHandler = (event: MessageEvent) => {
    if (event.origin === GISCUS_ORIGIN) {
      loaded = true;
      clearTimeout(timeoutId);
      loadingEl.remove();
    }
  };
  window.addEventListener("message", messageHandler);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const syncTheme = () => {
    const frame = holder.querySelector<HTMLIFrameElement>("iframe.giscus-frame");
    frame?.contentWindow?.postMessage({ giscus: { setConfig: { theme: preferredTheme() } } }, GISCUS_ORIGIN);
  };
  media.addEventListener("change", syncTheme);
}

export function mount(container: HTMLElement, _signal: AbortSignal): void {
  container.innerHTML = `
    <section class="step">
      <div class="step__head">
        <h1>${t("page.discussions.title")}</h1>
      </div>
      <noscript>
        <div class="discussions-fallback">
          <p class="discussions-fallback__desc">${t("discussions.nojs.desc")}</p>
          <div class="discussions-fallback__actions">
            <a class="primary" href="${GITHUB_DISCUSSIONS_URL}" target="_blank" rel="noopener">${t("discussions.fallback.action")}</a>
          </div>
        </div>
      </noscript>
      <div id="discussions-body"></div>
    </section>
  `;
  setPageMeta(t("page.discussions.title"), t("meta.discussions.description"));
  mountGiscus(container.querySelector("#discussions-body")!);
}
