import { labelAttrs } from "../utils/labelAttrs";
import { t } from "../i18n";
import { CLOSE_ICON } from "../render/icons";
import { AnCornerOrDefault } from "../lib/subtitle/formats/topAlign";
import { PositionRule, SINGLE_POSITION_RULE } from "../lib/subtitle/formats/cueLayout";
import { positionLabel, renderPositionGridButtons } from "./positionGrid";

export interface PositionPopoverHandle {
  open(current: AnCornerOrDefault, title: string, onConfirm: (value: AnCornerOrDefault) => void, rule?: PositionRule): void;
}

export function createPositionPopover(): PositionPopoverHandle {
  function open(current: AnCornerOrDefault, title: string, onConfirm: (value: AnCornerOrDefault) => void, rule: PositionRule = SINGLE_POSITION_RULE): void {
    const label = current === rule.defaultAn ? t("positionPicker.currentDefault", { position: positionLabel(current) }) : positionLabel(current);
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal position-popover" role="dialog" aria-modal="true" aria-labelledby="position-popover-title">
        <div class="modal__head">
          <h2 id="position-popover-title" class="modal__title">${title}</h2>
          <button type="button" class="icon-btn modal__close" ${labelAttrs(t("preview.close"))}>${CLOSE_ICON}</button>
        </div>
        <div class="modal__body position-popover__body">
          ${renderPositionGridButtons(current, "pos-cell", rule.allowed)}
          <div class="position-popover__label">${label}</div>
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

    backdrop.querySelectorAll<HTMLButtonElement>("[data-pos-cell]:not(:disabled)").forEach((cell) => {
      cell.addEventListener("click", () => {
        onConfirm(Number(cell.dataset.posCell) as AnCornerOrDefault);
        close();
      });
    });

    backdrop.querySelector<HTMLElement>(".position-grid__cell--active")?.focus();
  }

  return { open };
}
