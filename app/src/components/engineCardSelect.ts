import { subscribeEngineHealth } from "../api/engineHealth";
import { hasTextSelection } from "../utils/textSelection";
import { mountRadioGroup } from "./radioGroup";

export function mountModelCardSelect(container: HTMLElement, select: HTMLSelectElement, signal?: AbortSignal): void {
  const cards = Array.from(container.querySelectorAll<HTMLElement>("#engine-cards .engine-card[data-provider]"));
  const group = mountRadioGroup(cards);

  function sync(): void {
    cards.forEach((card) => {
      const active = card.dataset.provider === select.value;
      card.classList.toggle("engine-card--active", active);
      card.setAttribute("aria-checked", String(active));
    });
    group.sync();
  }

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      if (hasTextSelection()) return;
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
  const toggle = container.querySelector<HTMLElement>("#engine-more-toggle")!;
  const panel = container.querySelector<HTMLElement>("#engine-more-panel")!;
  toggle.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle.click();
  });
  toggle.addEventListener("click", () => {
    if (hasTextSelection()) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
  });
}
