const TRIGGER_SELECTOR = "[data-tooltip], [data-tooltip-overflow]";
const SHOW_DELAY_MS = 300;
const EDGE_MARGIN_PX = 8;
const ANCHOR_GAP_PX = 8;

function measuredElement(trigger: HTMLElement): HTMLElement {
  return trigger.matches("[data-tooltip-measure]") ? trigger : (trigger.querySelector<HTMLElement>("[data-tooltip-measure]") ?? trigger);
}

function tooltipText(trigger: HTMLElement): string | null {
  if (trigger.dataset.tooltip) return trigger.dataset.tooltip;
  const overflowText = trigger.dataset.tooltipOverflow;
  const measured = measuredElement(trigger);
  return overflowText && measured.scrollWidth > measured.clientWidth ? overflowText : null;
}

function triggerOf(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? node.closest<HTMLElement>(TRIGGER_SELECTOR) : null;
}

function focusTriggerOf(node: EventTarget | null): HTMLElement | null {
  return triggerOf(node) ?? (node instanceof Element ? node.querySelector<HTMLElement>(TRIGGER_SELECTOR) : null);
}

export function mountTooltip(): void {
  const bubble = document.createElement("div");
  bubble.className = "tooltip";
  bubble.id = "app-tooltip";
  bubble.setAttribute("role", "tooltip");
  bubble.hidden = true;
  document.body.append(bubble);
  let anchor: HTMLElement | null = null;
  let timer = 0;

  function hide(): void {
    window.clearTimeout(timer);
    anchor = null;
    bubble.hidden = true;
  }

  function place(trigger: HTMLElement): void {
    const triggerRect = trigger.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const fitsAbove = triggerRect.top - bubbleRect.height - ANCHOR_GAP_PX >= EDGE_MARGIN_PX;
    const top = fitsAbove ? triggerRect.top - bubbleRect.height - ANCHOR_GAP_PX : triggerRect.bottom + ANCHOR_GAP_PX;
    const centered = triggerRect.left + triggerRect.width / 2 - bubbleRect.width / 2;
    const left = Math.min(Math.max(centered, EDGE_MARGIN_PX), window.innerWidth - bubbleRect.width - EDGE_MARGIN_PX);
    bubble.style.top = `${top}px`;
    bubble.style.left = `${left}px`;
  }

  function show(trigger: HTMLElement): void {
    const text = tooltipText(trigger);
    if (!text) return;
    anchor = trigger;
    bubble.textContent = text;
    bubble.hidden = false;
    place(trigger);
  }

  document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse" || bubble.contains(event.target as Node)) return;
    const trigger = triggerOf(event.target);
    if (trigger && trigger === anchor) return;
    hide();
    if (trigger) timer = window.setTimeout(() => show(trigger), SHOW_DELAY_MS);
  });

  document.addEventListener("pointerout", (event) => {
    if (event.pointerType !== "mouse") return;
    const destination = event.relatedTarget;
    if (destination instanceof Node && (bubble.contains(destination) || anchor?.contains(destination))) return;
    hide();
  });

  document.addEventListener("focusin", (event) => {
    const trigger = focusTriggerOf(event.target);
    if (!trigger || !(event.target as HTMLElement).matches(":focus-visible")) return;
    hide();
    show(trigger);
  });

  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide);
  window.addEventListener("resize", hide);
  window.addEventListener("scroll", hide, { capture: true, passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !bubble.hidden) hide();
  });
}
