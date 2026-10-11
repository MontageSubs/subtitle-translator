import type { DictionaryEntry } from "../utils/dictionary";
import { t } from "../i18n";
import { CLOSE_ICON, renderDirectionArrow } from "../render/icons";
import { escapeHtml } from "../utils/escapeHtml";

const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

export function stripEmoji(value: string): string {
  return value.replace(EMOJI_PATTERN, "");
}

export function emptyEntry(): DictionaryEntry {
  return { source: "", target: "" };
}

export function pairLines(sourceText: string, targetText: string): DictionaryEntry[] {
  const sourceLines = sourceText.split("\n");
  const targetLines = targetText.split("\n");
  return Array.from({ length: Math.max(sourceLines.length, targetLines.length) }, (_, index) => ({
    source: stripEmoji((sourceLines[index] ?? "").trim()),
    target: stripEmoji((targetLines[index] ?? "").trim()),
  }));
}

function renderRows(entries: DictionaryEntry[]): string {
  const rows = entries.map((entry, index) => `
      <div class="glossary__row ${!entry.source && !entry.target ? "glossary__row--empty" : ""}" data-index="${index}">
        <input type="text" class="glossary__source" aria-label="${t("glossary.sourceLabel")} ${index + 1}" value="${escapeHtml(entry.source)}" placeholder="${t("glossary.sourcePlaceholder")}" />
        <span class="glossary__arrow">${renderDirectionArrow(14)}</span>
        <input type="text" class="glossary__target" aria-label="${t("glossary.targetLabel")} ${index + 1}" value="${escapeHtml(entry.target)}" placeholder="${t("glossary.targetPlaceholder")}" />
        <button type="button" class="icon-btn glossary__remove" aria-label="${t("glossary.remove")} ${index + 1}" data-remove="${index}">${CLOSE_ICON}</button>
      </div>`);
  return `<div class="glossary__rows">${rows.join("")}</div>`;
}

function renderBulk(entries: DictionaryEntry[]): string {
  return `<div class="glossary__bulk">
      <textarea id="glossary-bulk-source" aria-label="${t("glossary.sourceLabel")}" placeholder="${t("glossary.bulkSourcePlaceholder")}">${escapeHtml(entries.map((entry) => entry.source).join("\n"))}</textarea>
      <span class="glossary__bulk-arrow">${renderDirectionArrow(16)}</span>
      <textarea id="glossary-bulk-target" aria-label="${t("glossary.targetLabel")}" placeholder="${t("glossary.bulkTargetPlaceholder")}">${escapeHtml(entries.map((entry) => entry.target).join("\n"))}</textarea>
    </div>
    <div class="glossary__bulk-count" id="glossary-bulk-count"></div>`;
}

function renderModeButton(bulk: boolean, label: string, bulkMode: boolean): string {
  const active = bulk === bulkMode;
  return `<button type="button" class="segmented__option${active ? " segmented__option--active" : ""}" data-action="${bulk ? "mode-bulk" : "mode-rows"}" aria-pressed="${active}">${label}</button>`;
}

export function renderGlossary(entries: DictionaryEntry[], bulkMode: boolean): string {
  return `
      <div class="glossary__toolbar">
        <p class="field__desc">${t("glossary.desc")}</p>
        <div class="segmented" role="group" aria-label="${t("glossary.label")}">${renderModeButton(false, t("glossary.modeRows"), bulkMode)}${renderModeButton(true, t("glossary.modeBulk"), bulkMode)}</div>
      </div>
      ${bulkMode ? renderBulk(entries) : renderRows(entries)}
      <div class="glossary__actions">
        <button type="button" class="action-pill" data-action="add-row"${bulkMode ? " disabled" : ""}>${t("glossary.addRow")}</button>
        <button type="button" class="action-pill" data-action="import">${t("field.importFromHistory")}</button>
      </div>
    `;
}
