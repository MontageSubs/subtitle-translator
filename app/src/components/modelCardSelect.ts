export function mountModelCardSelect(container: HTMLElement, select: HTMLSelectElement): void {
  const cards = container.querySelectorAll<HTMLButtonElement>("#model-cards .model-card[data-provider]");

  function sync(): void {
    cards.forEach((card) => {
      const active = card.dataset.provider === select.value;
      card.classList.toggle("model-card--active", active);
      card.setAttribute("aria-checked", String(active));
    });
  }

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      select.value = card.dataset.provider!;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  select.addEventListener("change", sync);
  sync();
}
