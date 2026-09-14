export interface ChoiceCardsHandle {
  setValue(value: string): void;
}

export function mountChoiceCards(
  container: HTMLElement,
  selected: string,
  onChange: (value: string) => void
): ChoiceCardsHandle {
  const cards = container.querySelectorAll<HTMLButtonElement>(".choice-card[data-value]");

  function setValue(value: string): void {
    cards.forEach((card) => {
      const active = card.dataset.value === value;
      card.classList.toggle("choice-card--active", active);
      card.setAttribute("aria-checked", String(active));
    });
  }

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const value = card.dataset.value!;
      setValue(value);
      onChange(value);
    });
  });
  setValue(selected);

  return { setValue };
}
