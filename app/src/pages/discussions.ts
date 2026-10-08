import { GISCUS_REPO, GISCUS_REPO_ID, GISCUS_CATEGORY, GISCUS_CATEGORY_ID } from '../config/giscusConfig';
import { setPageMeta } from '../config/head';
import { getLocale, t, LOCALE_META } from "../i18n";

const GISCUS_ORIGIN = "https://giscus.app";
const GITHUB_DISCUSSIONS_URL = `https://github.com/${GISCUS_REPO}/discussions`;

const LOAD_TIMEOUT_MS = 10_000;
const LOADING_FADE_MS = 300;

let cachedHolder: HTMLElement | null = null;

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (cachedHolder) syncGiscusConfig(cachedHolder);
});

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

function syncGiscusConfig(holder: HTMLElement): void {
  const frame = holder.querySelector<HTMLIFrameElement>("iframe.giscus-frame");
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage(
    {
      giscus: {
        setConfig: {
          theme: preferredTheme(),
          lang: LOCALE_META[getLocale()].giscus,
        },
      },
    },
    GISCUS_ORIGIN
  );
}

function buildGiscusScript(): HTMLScriptElement {
  const script = document.createElement("script");
  script.src = `${GISCUS_ORIGIN}/client.js`;
  script.async = true;
  script.crossOrigin = "anonymous";
  const attributes: Record<string, string> = {
    "data-repo": GISCUS_REPO,
    "data-repo-id": GISCUS_REPO_ID,
    "data-category": GISCUS_CATEGORY,
    "data-category-id": GISCUS_CATEGORY_ID,
    "data-mapping": "pathname",
    "data-strict": "0",
    "data-reactions-enabled": "0",
    "data-emit-metadata": "0",
    "data-input-position": "bottom",
    "data-theme": preferredTheme(),
    "data-lang": LOCALE_META[getLocale()].giscus,
  };
  Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
  return script;
}

function renderLoading(): HTMLElement {
  const loading = document.createElement("div");
  loading.className = "discussions-loading";
  loading.innerHTML = `<div class="discussions-spinner" aria-hidden="true"></div><span>${t("discussions.loading")}</span>`;
  return loading;
}

function mountGiscus(container: HTMLElement): void {
  if (cachedHolder) {
    container.appendChild(cachedHolder);
    syncGiscusConfig(cachedHolder);
    return;
  }

  const holder = document.createElement("div");
  holder.className = "discussions-embed";
  cachedHolder = holder;
  const loading = renderLoading();
  holder.append(loading);
  container.appendChild(holder);

  const attempt = new AbortController();
  let loaded = false;
  let timeoutId = 0;

  function fail(): void {
    if (loaded) return;
    window.clearTimeout(timeoutId);
    attempt.abort();
    holder.remove();
    cachedHolder = null;
    renderFallback(container, () => {
      container.innerHTML = "";
      mountGiscus(container);
    });
  }

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== GISCUS_ORIGIN) return;
    loaded = true;
    attempt.abort();
    window.clearTimeout(timeoutId);
    loading.style.opacity = "0";
    window.setTimeout(() => loading.remove(), LOADING_FADE_MS);
  }, { signal: attempt.signal });

  timeoutId = window.setTimeout(fail, LOAD_TIMEOUT_MS);
  const script = buildGiscusScript();
  script.onerror = fail;
  holder.appendChild(script);
}

export function onRouteRevisit(): void {
  setPageMeta(t("page.discussions.title"), t("meta.discussions.description"));
  if (cachedHolder) {
    syncGiscusConfig(cachedHolder);
  }
}

export function mount(container: HTMLElement): void {
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
