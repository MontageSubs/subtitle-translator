import { GISCUS_REPO, GISCUS_REPO_ID, GISCUS_CATEGORY, GISCUS_CATEGORY_ID } from "../giscusConfig";
import { setPageMeta } from "../head";
import { getLocale, t } from "../i18n";
import { GISCUS_LOCALES } from "../giscusLocale";

const GISCUS_ORIGIN = "https://giscus.app";

function preferredTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function mountGiscus(container: HTMLElement): void {
  const holder = document.createElement("div");
  holder.className = "discussions-embed";
  container.appendChild(holder);

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
  holder.appendChild(script);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const syncTheme = () => {
    const frame = holder.querySelector<HTMLIFrameElement>("iframe.giscus-frame");
    frame?.contentWindow?.postMessage({ giscus: { setConfig: { theme: preferredTheme() } } }, GISCUS_ORIGIN);
  };
  media.addEventListener("change", syncTheme);
}

export function mount(container: HTMLElement, _signal: AbortSignal): void {
  container.innerHTML = `<section class="step"><h1>${t("page.discussions.title")}</h1></section>`;
  setPageMeta(t("page.discussions.title"), t("meta.discussions.description"));
  mountGiscus(container.querySelector("section")!);
}
