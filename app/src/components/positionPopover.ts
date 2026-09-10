import { t } from "../i18n";
import { AnCornerOrDefault } from "../lib/subtitle/topAlign";
import { positionLabel, renderPositionGridButtons } from "./positionGrid";

export interface PositionPopoverHandle {
  open(anchor: HTMLElement, current: AnCornerOrDefault, title: string, onConfirm: (value: AnCornerOrDefault) => void): void;
  close(): void;
}

export function createPositionPopover(): PositionPopoverHandle {
  const panel = document.createElement("div");
  panel.className = "position-popover";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", t("positionPicker.title"));
  panel.hidden = true;
  document.body.appendChild(panel);

  let selected: AnCornerOrDefault = 2;
  let lastFocused: HTMLElement | null = null;

  function render(title: string) {
    panel.innerHTML = `
      <div class="position-popover__title">${title}</div>
      ${renderPositionGridButtons(selected, "pos-cell")}
      <div class="position-popover__label">${positionLabel(selected)}</div>
      <div class="position-popover__actions">
        <button type="button" class="ghost-btn ghost-btn--mini" data-pos-cancel>${t("positionPicker.cancel")}</button>
        <button type="button" class="secondary" data-pos-confirm>${t("positionPicker.confirm")}</button>
      </div>
    `;
  }

  function reposition(anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const margin = 8;
    let top = rect.bottom + margin;
    let left = rect.left;
    if (top + panelRect.height > window.innerHeight - margin) top = rect.top - panelRect.height - margin;
    if (left + panelRect.width > window.innerWidth - margin) left = window.innerWidth - panelRect.width - margin;
    panel.style.top = `${Math.max(margin, top)}px`;
    panel.style.left = `${Math.max(margin, left)}px`;
  }

  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    document.removeEventListener("mousedown", handleOutsideClick, true);
    document.removeEventListener("keydown", handleKeydown, true);
    lastFocused?.focus();
    lastFocused = null;
  }

  function handleOutsideClick(e: MouseEvent) {
    if (!panel.contains(e.target as Node)) close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  }

  function open(anchor: HTMLElement, current: AnCornerOrDefault, title: string, onConfirm: (value: AnCornerOrDefault) => void) {
    selected = current;
    lastFocused = document.activeElement as HTMLElement;
    render(title);
    panel.hidden = false;
    reposition(anchor);

    panel.querySelectorAll<HTMLButtonElement>("[data-pos-cell]").forEach((cell) => {
      cell.addEventListener("click", () => {
        selected = Number(cell.dataset.posCell) as AnCornerOrDefault;
        render(title);
        panel.querySelector<HTMLElement>("[data-pos-cell].position-grid__cell--active")?.focus();
      });
    });
    panel.querySelector<HTMLButtonElement>("[data-pos-cancel]")!.addEventListener("click", close);
    panel.querySelector<HTMLButtonElement>("[data-pos-confirm]")!.addEventListener("click", () => {
      onConfirm(selected);
      close();
    });
    panel.querySelector<HTMLElement>(".position-grid__cell--active")?.focus();

    document.addEventListener("mousedown", handleOutsideClick, true);
    document.addEventListener("keydown", handleKeydown, true);
  }

  return { open, close };
}
