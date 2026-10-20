import { subscribeEngineHealth } from "../api/engineHealth";
import { mountRadioGroup } from "./radioGroup";

export function mountModelCardSelect(container: HTMLElement, select: HTMLSelectElement, signal?: AbortSignal): void {
  const cards = Array.from(container.querySelectorAll<HTMLButtonElement>("#model-cards .model-card[data-provider]"));
  const group = mountRadioGroup(cards);

  function sync(): void {
    cards.forEach((card) => {
      const active = card.dataset.provider === select.value;
      card.classList.toggle("model-card--active", active);
      card.setAttribute("aria-checked", String(active));
    });
    group.sync();
  }

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      select.value = card.dataset.provider!;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  select.addEventListener("change", sync);
  sync();

  const unsubscribe = subscribeEngineHealth((flagged) => {
    cards.forEach((card) => {
      const warned = flagged.has(card.dataset.provider!);
      card.querySelector<HTMLElement>("[data-engine-health]")!.hidden = !warned;
      const recommended = card.querySelector<HTMLElement>("[data-engine-recommended]");
      if (recommended) recommended.hidden = warned;
    });
  });
  signal?.addEventListener("abort", unsubscribe, { once: true });
}

export function mountModelMore(container: HTMLElement): void {
  const toggle = container.querySelector<HTMLButtonElement>("#model-more-toggle")!;
  const panel = container.querySelector<HTMLElement>("#model-more-panel")!;
  toggle.addEventListener("click", () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
  });
}
