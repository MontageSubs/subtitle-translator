import { renderDiscussionsFallback, renderNewTabLink } from "../render/discussionsMarkup";
import { DISCUSSIONS_URL } from "../config/social";
import { applyPageMeta } from '../config/head';
import { getLocale, t, giscusLanguage, th } from "../i18n";
import { buildPath } from "../router/router";
import { markup } from "../i18n/markup";

export const GISCUS_REPO = "MontageSubs/subtitle-translator";
export const GISCUS_REPO_ID = "R_kgDOUA3Chg";
export const GISCUS_CATEGORY = "General";
export const GISCUS_CATEGORY_ID = "DIC_kwDOUA3Chs4DD93B";
const GISCUS_ORIGIN = "https://giscus.app";

const GITHUB_DISCUSSIONS_LABEL = "GitHub Discussions";
const LOAD_TIMEOUT_MS = 25_000;

interface GiscusMessageEnvelope {
  giscus?: { error?: unknown };
}

const RECOVERABLE_GISCUS_ERROR = /Discussion not found|API rate limit exceeded|Bad credentials|Invalid state value|State has expired/;

let cachedHolder: HTMLElement | null = null;
let activeBody: HTMLElement | null = null;

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (cachedHolder) syncGiscusConfig(cachedHolder);
});

function preferredTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function buildNotes(): HTMLElement {
  const locale = getLocale();
  const newTabLabel = t("a11y.opensInNewTab");
  const conduct = markup(renderNewTabLink(buildPath(locale, "docs", ["code-of-conduct"]), th("discussions.conduct.link"), newTabLabel));
  const community = markup(renderNewTabLink(buildPath(locale, "docs", ["community"]), th("discussions.community.link"), newTabLabel));
  const github = markup(renderNewTabLink(DISCUSSIONS_URL, GITHUB_DISCUSSIONS_LABEL, newTabLabel));
  const notes = document.createElement("div");
  notes.className = "page-subtitle discussions-notes";
  notes.hidden = true;
  notes.innerHTML = `<p>${th("discussions.conduct", { conduct })}</p><p>${th("discussions.community", { community })}</p><p>${th("discussions.scope", { github })}</p>`;
  return notes;
}

function renderFallback(container: HTMLElement, onRetry: () => void): void {
  container.innerHTML = renderDiscussionsFallback({
    locale: getLocale(),
    communityHref: buildPath(getLocale(), "docs", ["community"]),
    messageKey: "discussions.fallback.desc",
    retryable: true,
  });
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
          lang: giscusLanguage(getLocale()),
        },
      },
    },
    GISCUS_ORIGIN
  );
}

const discussionsPath = (): string => buildPath(getLocale(), "discussions");

const giscusTerm = (): string => discussionsPath().slice(1);

function pinBacklink(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="giscus:backlink"]') ?? document.head.appendChild(Object.assign(document.createElement("meta"), { name: "giscus:backlink" }));
  meta.content = new URL(discussionsPath(), location.origin).href;
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
    "data-mapping": "specific",
    "data-term": giscusTerm(),
    "data-strict": "1",
    "data-reactions-enabled": "0",
    "data-emit-metadata": "0",
    "data-input-position": "bottom",
    "data-theme": preferredTheme(),
    "data-lang": giscusLanguage(getLocale()),
  };
  Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
  return script;
}

function renderLoading(): HTMLElement {
  const loading = document.createElement("div");
  loading.className = "discussions-loading";
  loading.innerHTML = `<div class="discussions-spinner" aria-hidden="true"></div><span>${th("discussions.loading")}</span>`;
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
  const notes = buildNotes();
  holder.append(loading, notes);
  container.appendChild(holder);

  const attempt = new AbortController();
  let loaded = false;
  let timeoutId = 0;

  function fail(): void {
    window.clearTimeout(timeoutId);
    attempt.abort();
    holder.remove();
    cachedHolder = null;
    if (activeBody) showFallback(activeBody);
  }

  function markLoaded(): void {
    loaded = true;
    window.clearTimeout(timeoutId);
    notes.hidden = false;
    loading.remove();
  }

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== GISCUS_ORIGIN) return;
    const message = (event.data as GiscusMessageEnvelope | null)?.giscus;
    if (!message) return;
    if (typeof message.error === "string" && !RECOVERABLE_GISCUS_ERROR.test(message.error)) return fail();
    if (!loaded) markLoaded();
  }, { signal: attempt.signal });

  timeoutId = window.setTimeout(() => {
    if (!loaded) fail();
  }, LOAD_TIMEOUT_MS);
  pinBacklink();
  const script = buildGiscusScript();
  script.onerror = () => {
    if (!loaded) fail();
  };
  holder.appendChild(script);
}

function showFallback(container: HTMLElement): void {
  renderFallback(container, () => {
    container.innerHTML = "";
    mountGiscus(container);
  });
}

function renderPage(container: HTMLElement): HTMLElement {
  container.innerHTML = `
    <section class="step">
      <div class="page-header">
        <h1 class="page-title">${th("page.discussions.title")}</h1>
      </div>
      <div id="discussions-body"></div>
    </section>
  `;
  return container.querySelector<HTMLElement>("#discussions-body")!;
}

export function onRouteRevisit(): void {
  applyPageMeta("discussions");
  if (cachedHolder) syncGiscusConfig(cachedHolder);
}

export function mount(container: HTMLElement): void {
  activeBody = renderPage(container);
  applyPageMeta("discussions");
  mountGiscus(activeBody);
}
