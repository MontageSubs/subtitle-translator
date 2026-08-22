import { t } from "../i18n";

export function mount(container: HTMLElement): void {
  container.innerHTML = `
    <section class="step">
      <h2>${t("page.about.title")}</h2>
      <p class="muted">${t("page.about.placeholder")}</p>
    </section>
  `;
}
