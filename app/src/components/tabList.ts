const HORIZONTAL_STEPS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

export function nextTabIndex(key: string, current: number, count: number, rightToLeft: boolean): number | null {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const step = HORIZONTAL_STEPS[key];
  return step ? (current + step * (rightToLeft ? -1 : 1) + count) % count : null;
}

export const isRightToLeft = (element: Element): boolean => getComputedStyle(element).direction === "rtl";

export function syncTabButtons(buttons: Iterable<HTMLElement>, isSelected: (button: HTMLElement) => boolean, activeClass: string): void {
  for (const button of buttons) {
    const selected = isSelected(button);
    button.classList.toggle(activeClass, selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected) button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }
}

export function isTabActivationKey(event: KeyboardEvent): boolean {
  return event.key === "Enter" || event.key === " ";
}
