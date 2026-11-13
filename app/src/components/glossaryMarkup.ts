import { labelAttrs, tipAttr } from "../utils/labelAttrs";
import type { GlossaryEntry } from "../utils/glossary";
import { t, th } from "../i18n";
import { CLOSE_ICON, renderDirectionArrow } from "../render/icons";
import { escapeHtml } from "../utils/escapeHtml";

const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

export function stripEmoji(value: string): string {
  return value.replace(EMOJI_PATTERN, "");
}

export interface GlossaryFooterSlot {
  markup(): string;
  mounted(): void;
}

export function emptyEntry(): GlossaryEntry {
  return { source: "", target: "" };
}

export function pairLines(sourceText: string, targetText: string): GlossaryEntry[] {
  const sourceLines = sourceText.split("\n");
  const targetLines = targetText.split("\n");
  return Array.from({ length: Math.max(sourceLines.length, targetLines.length) }, (_, index) => ({
    source: stripEmoji((sourceLines[index] ?? "").trim()),
    target: stripEmoji((targetLines[index] ?? "").trim()),
  }));
}

function renderRow(entry: GlossaryEntry, index: number, pending: boolean): string {
  const blank = !entry.source && !entry.target;
  return `
      <div class="glossary__row${blank ? " glossary__row--empty" : ""}${pending ? " glossary__row--pending" : ""}" data-index="${index}">
        <input type="text" class="glossary__source" aria-label="${th("glossary.sourceLabel")} ${index + 1}" value="${escapeHtml(entry.source)}" placeholder="${th("glossary.sourcePlaceholder")}" />
        <span class="glossary__arrow">${renderDirectionArrow(14)}</span>
        <input type="text" class="glossary__target" aria-label="${th("glossary.targetLabel")} ${index + 1}" value="${escapeHtml(entry.target)}" placeholder="${th(pending ? "glossary.pendingPlaceholder" : "glossary.targetPlaceholder")}" />
        <button type="button" class="icon-btn glossary__remove" ${labelAttrs(t("glossary.removeRow", { index: index + 1 }))}>${CLOSE_ICON}</button>
      </div>`;
}

function renderRows(entries: GlossaryEntry[], pending: ReadonlySet<GlossaryEntry>): string {
  return `<div class="glossary__rows">${entries.map((entry, index) => renderRow(entry, index, pending.has(entry))).join("")}</div>`;
}

function bulkText(entries: GlossaryEntry[], field: keyof GlossaryEntry): string {
  return entries.filter((entry) => entry.source || entry.target).map((entry) => entry[field]).join("\n");
}

function renderBulkField(field: "source" | "target", entries: GlossaryEntry[]): string {
  const labelKey = field === "source" ? "glossary.sourceLabel" : "glossary.targetLabel";
  const placeholderKey = field === "source" ? "glossary.bulkSourcePlaceholder" : "glossary.bulkTargetPlaceholder";
  const clearKey = field === "source" ? "glossary.clearBulkSource" : "glossary.clearBulkTarget";
  return `<div class="glossary__bulk-field input-with-clear">
        <textarea id="glossary-bulk-${field}" aria-label="${th(labelKey)}" placeholder="${th(placeholderKey)}">${escapeHtml(bulkText(entries, field))}</textarea>
        <button type="button" class="input-clear-btn glossary__bulk-clear" data-bulk-field="${field}" ${labelAttrs(t(clearKey))}>${CLOSE_ICON}</button>
      </div>`;
}

function renderBulk(entries: GlossaryEntry[]): string {
  return `<div class="glossary__bulk">
      ${renderBulkField("source", entries)}
      <span class="glossary__bulk-arrow">${renderDirectionArrow(16)}</span>
      ${renderBulkField("target", entries)}
    </div>`;
}

function renderModeButton(bulk: boolean, label: string, bulkMode: boolean): string {
  const active = bulk === bulkMode;
  return `<button type="button" class="segmented__option${active ? " segmented__option--active" : ""}" data-action="${bulk ? "mode-bulk" : "mode-rows"}" role="radio" aria-checked="${active}" ${tipAttr(t(bulk ? "tip.glossaryBulk" : "tip.glossaryRows"))}>${label}</button>`;
}

export function renderGlossary(entries: GlossaryEntry[], bulkMode: boolean, pending: ReadonlySet<GlossaryEntry>, slot: GlossaryFooterSlot | null): string {
  return `
      <div class="glossary__toolbar">
        <p class="field__desc">${th("glossary.desc")}</p>
        <div class="segmented" role="radiogroup" aria-label="${th("glossary.label")}">${renderModeButton(false, t("glossary.modeRows"), bulkMode)}${renderModeButton(true, t("glossary.modeBulk"), bulkMode)}</div>
      </div>
      ${bulkMode ? renderBulk(entries) : renderRows(entries, pending)}
      <div class="field__footer">
        <button type="button" class="action-pill" data-action="import" ${tipAttr(t("tip.importGlossary"))}>${th("field.importFromHistory")}</button>
        ${bulkMode
          ? '<span class="field__counter" id="glossary-bulk-count"></span>'
          : `<button type="button" class="action-pill" data-action="add-row" ${tipAttr(t("tip.addRow"))}>${th("glossary.addRow")}</button>`}
      </div>
      ${slot?.markup() ?? ""}
    `;
}
