import { t } from "../i18n";
import { CLOSE_ICON } from "../render/icons";
import { AnCornerOrDefault } from "../lib/subtitle/topAlign";
import { positionLabel, renderPositionGridButtons } from "./positionGrid";

export interface PositionPopoverHandle {
  open(current: AnCornerOrDefault, title: string, onConfirm: (value: AnCornerOrDefault) => void): void;
}

export function createPositionPopover(): PositionPopoverHandle {
  function open(current: AnCornerOrDefault, title: string, onConfirm: (value: AnCornerOrDefault) => void): void {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal position-popover" role="dialog" aria-modal="true" aria-labelledby="position-popover-title">
        <div class="modal__head">
          <h2 id="position-popover-title" class="modal__title" style="margin: 0; font-size: 1.02rem;">${title}</h2>
          <button type="button" class="icon-btn modal__close" aria-label="${t("preview.close")}">${CLOSE_ICON}</button>
        </div>
        <div class="modal__body position-popover__body">
          ${renderPositionGridButtons(current, "pos-cell")}
          <div class="position-popover__label">${positionLabel(current)}</div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    function close(): void {
      backdrop.remove();
    }

    backdrop.querySelector(".modal__close")?.addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    backdrop.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    backdrop.querySelectorAll<HTMLButtonElement>("[data-pos-cell]").forEach((cell) => {
      cell.addEventListener("click", () => {
        onConfirm(Number(cell.dataset.posCell) as AnCornerOrDefault);
        close();
      });
    });

    backdrop.querySelector<HTMLElement>(".position-grid__cell--active")?.focus();
  }

  return { open };
}
