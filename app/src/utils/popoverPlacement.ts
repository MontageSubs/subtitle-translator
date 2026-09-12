export function keepPopoverInViewport(popover: HTMLElement, flipClass: string, margin = 8): void {
  popover.classList.remove(flipClass);
  const rect = popover.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < margin && rect.top > margin - spaceBelow) popover.classList.add(flipClass);
}
