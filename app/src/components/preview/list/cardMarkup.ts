import { t } from "../../../i18n";
import { escapeHtml } from "../../../utils/escapeHtml";
import { AnCornerOrDefault } from "../../../lib/subtitle/formats/topAlign";
import { renderPositionBadgeSvg } from "../../positionGrid";
import { highlightText } from "../metrics/highlight";
import { PreviewCard } from "../types";

export interface CardMarkupInput {
  card: PreviewCard;
  target: string;
  classes: string;
  top: number;
  height: number;
  reason: string;
  severeReason: boolean;
  position: AnCornerOrDefault;
  needle: string;
}

export function renderSceneDivider(top: number, sceneIndex: number): string {
  return `<div class="preview-card__scene-divider" style="top:${top}px;"><span class="preview-card__scene-tag">${t("preview.sceneHeader", { number: sceneIndex })}</span></div>`;
}

export function renderCard({ card, target, classes, top, height, reason, severeReason, position, needle }: CardMarkupInput): string {
  const source = needle ? highlightText(card.source, needle) : escapeHtml(card.source);
  const rendered = needle ? highlightText(target, needle) : escapeHtml(target);
  const reasonHtml = reason
    ? `<div class="preview-card__reason" role="alert" aria-live="polite">${severeReason ? "✕" : "⚠"} ${escapeHtml(reason)}</div>`
    : "";
  const badgeHint = t("positionPicker.badgeHint");
  return `<div class="${classes}" data-card-id="${card.id}" style="top:${top}px;height:${height}px;box-sizing:border-box;" role="region" aria-label="${t("preview.cueLabel", { id: card.id })}">
        <div class="preview-card__id">
          <span>#${card.id} · ${card.start} → ${card.end}</span>
          <button type="button" class="preview-card__pos-badge${position !== 2 ? " preview-card__pos-badge--active" : ""}"
            data-pos-badge="${card.id}" aria-label="${badgeHint}"
            title="${badgeHint}">
            ${renderPositionBadgeSvg(position)}
          </button>
        </div>
        ${reasonHtml}
        <div class="preview-card__src" tabindex="0">${source}</div>
        <div class="preview-card__dst" data-editable="${card.id}" aria-label="${t("preview.tabRawTarget")}" tabindex="0" data-placeholder="${t("preview.missing")}">${rendered}</div>
      </div>`;
}
