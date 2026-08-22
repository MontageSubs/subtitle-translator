import { GITHUB_REPO } from "../config";
import { t } from "../i18n";

interface GithubContributor {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

function renderGrid(contributors: GithubContributor[]): string {
  return `
    <div class="contributor-grid">
      ${contributors
        .map(
          (person) => `
            <a class="contributor-card" href="${person.html_url}" target="_blank" rel="noopener">
              <img class="contributor-card__avatar" src="${person.avatar_url}&s=96" alt="${person.login}" loading="lazy" />
              <span class="contributor-card__name">${person.login}</span>
              <span class="contributor-card__count">${t("page.contributors.commits", { count: person.contributions })}</span>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

export async function mount(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <section class="step">
      <h2>${t("page.contributors.title")}</h2>
      <p class="muted" id="contributors-status">${t("page.contributors.loading")}</p>
    </section>
  `;

  if (!GITHUB_REPO) {
    container.querySelector("#contributors-status")!.textContent = t("page.contributors.placeholder");
    return;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contributors?per_page=100`);
    if (!response.ok) throw new Error(String(response.status));
    const contributors: GithubContributor[] = await response.json();
    container.querySelector("section")!.insertAdjacentHTML("beforeend", renderGrid(contributors));
    container.querySelector("#contributors-status")!.remove();
  } catch {
    container.querySelector("#contributors-status")!.textContent = t("page.contributors.error");
  }
}
