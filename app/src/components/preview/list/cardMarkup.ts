import { t } from "../../../i18n";
import { escapeHtml } from "../../../utils/escapeHtml";
import { AnCornerOrDefault } from "../../../lib/subtitle/formats/topAlign";
import { renderPositionBadgeSvg } from "../../positionGrid";
import { PreviewCard } from "../types";

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

function highlightText(text: string, needle: string): string {
  const safe = escapeHtml(text);
  if (!needle) return safe;
  const pattern = new RegExp(escapeHtml(needle).replace(REGEX_SPECIALS, "\\$&"), "gi");
  return safe.replace(pattern, (match) => `<mark class="preview-search-highlight">${match}</mark>`);
}

export interface CardMarkupInput {
  card: PreviewCard;
  target: string;
  classes: string;
  top: number;
  height: number;
  reason: string;
  severeReason: boolean;
  position: AnCornerOrDefault;
  defaultPosition: AnCornerOrDefault;
  needle: string;
}

export function renderSceneDivider(top: number, sceneIndex: number): string {
  return `<div class="preview-card__scene-divider" style="top:${top}px;"><span class="preview-card__scene-tag">${t("preview.sceneHeader", { number: sceneIndex })}</span></div>`;
}

export function renderCard({ card, target, classes, top, height, reason, severeReason, position, defaultPosition, needle }: CardMarkupInput): string {
  const source = needle ? highlightText(card.source, needle) : escapeHtml(card.source);
  const rendered = needle ? highlightText(target, needle) : escapeHtml(target);
  const reasonHtml = reason
    ? `<div class="preview-card__reason" role="alert" aria-live="polite">${severeReason ? "✕" : "⚠"} ${escapeHtml(reason)}</div>`
    : "";
  const badgeHint = t("positionPicker.badgeHint");
  const positionControl = card.locked
    ? `<span class="preview-card__lock">${t("preview.locked")}</span>`
    : `<button type="button" class="preview-card__pos-badge${position !== defaultPosition ? " preview-card__pos-badge--active" : ""}"
            data-pos-badge="${card.id}" aria-label="${badgeHint}"
            title="${badgeHint}">
            ${renderPositionBadgeSvg(position, defaultPosition)}
          </button>`;
  const editableAttribute = card.locked ? 'aria-readonly="true"' : `data-editable="${card.id}"`;
  return `<div class="${classes}" data-card-id="${card.id}" style="top:${top}px;height:${height}px;box-sizing:border-box;" role="region" aria-label="${t("preview.cueLabel", { id: card.id })}">
        <div class="preview-card__id">
          <span dir="ltr">#${card.id} · ${card.start} → ${card.end}</span>
          ${positionControl}
        </div>
        ${reasonHtml}
        <div class="preview-card__src" dir="auto" tabindex="0">${source}</div>
        <div class="preview-card__dst" dir="auto" ${editableAttribute} aria-label="${t("preview.tabRawTarget")}" tabindex="0" data-placeholder="${t("preview.missing")}">${rendered}</div>
      </div>`;
}
