import { labelAttrs, tipAttr } from "../utils/labelAttrs";
import type { DictionaryEntry } from "../utils/dictionary";
import { t } from "../i18n";
import { CLOSE_ICON, renderDirectionArrow } from "../render/icons";
import { escapeHtml } from "../utils/escapeHtml";

const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

export function stripEmoji(value: string): string {
  return value.replace(EMOJI_PATTERN, "");
}

export interface GlossaryFooterSlot {
  actionMarkup(): string;
  statusMarkup(): string;
  mounted(): void;
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

function renderRow(entry: DictionaryEntry, index: number, pending: boolean): string {
  const blank = !entry.source && !entry.target;
  return `
      <div class="glossary__row${blank ? " glossary__row--empty" : ""}${pending ? " glossary__row--pending" : ""}" data-index="${index}">
        <input type="text" class="glossary__source" aria-label="${t("glossary.sourceLabel")} ${index + 1}" value="${escapeHtml(entry.source)}" placeholder="${t("glossary.sourcePlaceholder")}" />
        <span class="glossary__arrow">${renderDirectionArrow(14)}</span>
        <input type="text" class="glossary__target" aria-label="${t("glossary.targetLabel")} ${index + 1}" value="${escapeHtml(entry.target)}" placeholder="${t(pending ? "glossary.pendingPlaceholder" : "glossary.targetPlaceholder")}" />
        <button type="button" class="icon-btn glossary__remove" ${labelAttrs(t("glossary.removeRow", { index: index + 1 }))}>${CLOSE_ICON}</button>
      </div>`;
}

function renderRows(entries: DictionaryEntry[], pending: ReadonlySet<DictionaryEntry>): string {
  return `<div class="glossary__rows">${entries.map((entry, index) => renderRow(entry, index, pending.has(entry))).join("")}</div>`;
}

function bulkText(entries: DictionaryEntry[], field: keyof DictionaryEntry): string {
  return entries.filter((entry) => entry.source || entry.target).map((entry) => entry[field]).join("\n");
}

function renderBulk(entries: DictionaryEntry[]): string {
  return `<div class="glossary__bulk">
      <textarea id="glossary-bulk-source" aria-label="${t("glossary.sourceLabel")}" placeholder="${t("glossary.bulkSourcePlaceholder")}">${escapeHtml(bulkText(entries, "source"))}</textarea>
      <span class="glossary__bulk-arrow">${renderDirectionArrow(16)}</span>
      <textarea id="glossary-bulk-target" aria-label="${t("glossary.targetLabel")}" placeholder="${t("glossary.bulkTargetPlaceholder")}">${escapeHtml(bulkText(entries, "target"))}</textarea>
    </div>`;
}

function renderModeButton(bulk: boolean, label: string, bulkMode: boolean): string {
  const active = bulk === bulkMode;
  return `<button type="button" class="segmented__option${active ? " segmented__option--active" : ""}" data-action="${bulk ? "mode-bulk" : "mode-rows"}" aria-pressed="${active}" ${tipAttr(t(bulk ? "tip.glossaryBulk" : "tip.glossaryRows"))}>${label}</button>`;
}

export function renderGlossary(entries: DictionaryEntry[], bulkMode: boolean, pending: ReadonlySet<DictionaryEntry>, slot: GlossaryFooterSlot | null): string {
  return `
      <div class="glossary__toolbar">
        <p class="field__desc">${t("glossary.desc")}</p>
        <div class="segmented" role="group" aria-label="${t("glossary.label")}">${renderModeButton(false, t("glossary.modeRows"), bulkMode)}${renderModeButton(true, t("glossary.modeBulk"), bulkMode)}</div>
      </div>
      ${bulkMode ? renderBulk(entries) : renderRows(entries, pending)}
      <div class="field__footer">
        <div class="field__footer-group">
          <button type="button" class="action-pill" data-action="import" ${tipAttr(t("tip.importGlossary"))}>${t("field.importFromHistory")}</button>
          ${slot?.actionMarkup() ?? ""}
        </div>
        ${bulkMode
          ? '<span class="field__counter" id="glossary-bulk-count"></span>'
          : `<button type="button" class="action-pill" data-action="add-row" ${tipAttr(t("tip.addRow"))}>${t("glossary.addRow")}</button>`}
      </div>
      ${slot?.statusMarkup() ?? ""}
    `;
}
