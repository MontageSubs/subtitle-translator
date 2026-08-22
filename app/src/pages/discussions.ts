import { GISCUS_REPO, GISCUS_REPO_ID, GISCUS_CATEGORY, GISCUS_CATEGORY_ID } from "../config";
import { getLocale, getDirection, t } from "../i18n";

const GISCUS_LANGS: Record<string, string> = { "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", en: "en" };

function mountGiscus(container: HTMLElement): void {
  const holder = document.createElement("div");
  holder.className = "discussions-embed";
  container.appendChild(holder);

  const script = document.createElement("script");
  script.src = "https://giscus.app/client.js";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.setAttribute("data-repo", GISCUS_REPO);
  script.setAttribute("data-repo-id", GISCUS_REPO_ID);
  script.setAttribute("data-category", GISCUS_CATEGORY);
  script.setAttribute("data-category-id", GISCUS_CATEGORY_ID);
  script.setAttribute("data-mapping", "pathname");
  script.setAttribute("data-strict", "1");
  script.setAttribute("data-reactions-enabled", "1");
  script.setAttribute("data-input-position", "top");
  script.setAttribute("data-theme", window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  script.setAttribute("data-lang", GISCUS_LANGS[getLocale()]);
  script.setAttribute("data-dir", getDirection());
  holder.appendChild(script);
}

export function mount(container: HTMLElement): void {
  container.innerHTML = `<section class="step"><h2>${t("page.discussions.title")}</h2></section>`;

  const isConfigured = GISCUS_REPO && GISCUS_REPO_ID && GISCUS_CATEGORY && GISCUS_CATEGORY_ID;
  if (!isConfigured) {
    container.querySelector("section")!.insertAdjacentHTML("beforeend", `<p class="muted">${t("page.discussions.placeholder")}</p>`);
    return;
  }

  mountGiscus(container.querySelector("section")!);
}
