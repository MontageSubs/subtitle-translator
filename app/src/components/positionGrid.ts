import { t } from "../i18n";
import { AnCornerOrDefault } from "../lib/subtitle/topAlign";

export const AN_GRID_ORDER: AnCornerOrDefault[][] = [
  [7, 8, 9],
  [4, 5, 6],
  [1, 2, 3],
];

export function positionLabel(an: AnCornerOrDefault): string {
  return t(`positionPicker.corner.${an}`);
}

export function renderPositionBadgeSvg(active: AnCornerOrDefault): string {
  const cells: string[] = [];
  AN_GRID_ORDER.forEach((row, rowIndex) => {
    row.forEach((an, colIndex) => {
      const isActive = an === active && an !== 2;
      const fill = isActive ? "var(--accent)" : "currentColor";
      const opacity = isActive ? "1" : "0.35";
      cells.push(`<rect x="${colIndex * 9}" y="${rowIndex * 9}" width="6" height="6" rx="1.5" fill="${fill}" fill-opacity="${opacity}" />`);
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">${cells.join("")}</svg>`;
}

export function renderPositionGridButtons(active: AnCornerOrDefault, namePrefix: string): string {
  return `<div class="position-grid" role="radiogroup" aria-label="${t("positionPicker.title")}">
    ${AN_GRID_ORDER.flat().map((an) => `
      <button type="button" class="position-grid__cell${an === active ? " position-grid__cell--active" : ""}"
        role="radio" aria-checked="${an === active}" aria-label="${positionLabel(an)}" title="${positionLabel(an)}"
        data-${namePrefix}="${an}">
        <span class="position-grid__dot"></span>
      </button>`).join("")}
  </div>`;
}
