import { GISCUS_REPO, GISCUS_REPO_ID, GISCUS_CATEGORY, GISCUS_CATEGORY_ID } from "../config";
import { setPageMeta } from "../head";
import { en } from "../i18n/locales/en";
import { t } from "../i18n";

function mountGiscus(container: HTMLElement): void {
  const holder = document.createElement("div");
  holder.className = "discussions-embed";
  container.appendChild(holder);

  const englishTitle = `${en["page.discussions.title"]} · Subtitle Translator`;
  document.title = englishTitle;

  const script = document.createElement("script");
  script.src = "https://giscus.app/client.js";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.setAttribute("data-repo", GISCUS_REPO);
  script.setAttribute("data-repo-id", GISCUS_REPO_ID);
  script.setAttribute("data-category", GISCUS_CATEGORY);
  script.setAttribute("data-category-id", GISCUS_CATEGORY_ID);
  script.setAttribute("data-mapping", "pathname");
  script.setAttribute("data-strict", "0");
  script.setAttribute("data-reactions-enabled", "1");
  script.setAttribute("data-emit-metadata", "0");
  script.setAttribute("data-input-position", "bottom");
  script.setAttribute("data-theme", "preferred_color_scheme");
  script.setAttribute("data-lang", "en");
  holder.appendChild(script);
}

export function mount(container: HTMLElement, _signal: AbortSignal): void {
  container.innerHTML = `<section class="step"><h2>${t("page.discussions.title")}</h2></section>`;
  setPageMeta(t("page.discussions.title"), t("meta.discussions.description"));

  const isConfigured = GISCUS_REPO && GISCUS_REPO_ID && GISCUS_CATEGORY && GISCUS_CATEGORY_ID;
  if (!isConfigured) {
    container.querySelector("section")!.insertAdjacentHTML("beforeend", `<p class="muted">${t("page.discussions.placeholder")}</p>`);
    return;
  }

  mountGiscus(container.querySelector("section")!);
}
