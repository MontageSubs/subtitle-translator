import { DictionaryEntry, glossaryToEntries } from '../utils/dictionary';
import { t, onLocaleChange } from "../i18n";
import { CLOSE_ICON, renderDirectionArrow } from "../render/icons";
import { escapeHtml } from "../utils/escapeHtml";
import { openHistoryImportModal } from "./historyImportModal";

const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;
const HEIGHT_SYNC_TOLERANCE_PX = 1;

export interface GlossaryEditorHandle {
  getEntries(): DictionaryEntry[];
  setEntries(entries: DictionaryEntry[]): void;
}

export interface GlossaryEditorOptions {
  onChange?: () => void;
  minRows?: number;
  signal?: AbortSignal;
}

type EntryField = keyof DictionaryEntry;

function stripEmoji(value: string): string {
  return value.replace(EMOJI_PATTERN, "");
}

function emptyEntry(): DictionaryEntry {
  return { source: "", target: "" };
}

function pairLines(sourceText: string, targetText: string): DictionaryEntry[] {
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
        <input type="text" class="glossary__source" value="${escapeHtml(entry.source)}" placeholder="${t("glossary.sourcePlaceholder")}" />
        <span class="glossary__arrow">${renderDirectionArrow(14)}</span>
        <input type="text" class="glossary__target" value="${escapeHtml(entry.target)}" placeholder="${t("glossary.targetPlaceholder")}" />
        <button type="button" class="icon-btn glossary__remove" aria-label="${t("glossary.remove")}" data-remove="${index}">${CLOSE_ICON}</button>
      </div>`);
  return `<div class="glossary__rows">${rows.join("")}</div>`;
}

function renderBulk(entries: DictionaryEntry[]): string {
  return `<div class="glossary__bulk">
      <textarea id="glossary-bulk-source" placeholder="${t("glossary.bulkSourcePlaceholder")}">${escapeHtml(entries.map((entry) => entry.source).join("\n"))}</textarea>
      <span class="glossary__bulk-arrow">${renderDirectionArrow(16)}</span>
      <textarea id="glossary-bulk-target" placeholder="${t("glossary.bulkTargetPlaceholder")}">${escapeHtml(entries.map((entry) => entry.target).join("\n"))}</textarea>
    </div>
    <div class="glossary__bulk-count" id="glossary-bulk-count"></div>`;
}

export function mountGlossaryEditor(container: HTMLElement, initialEntries: DictionaryEntry[], options: GlossaryEditorOptions = {}): GlossaryEditorHandle {
  const { onChange, minRows = 1, signal } = options;
  let entries = padRows([...initialEntries]);
  let bulkMode = false;
  let heightObserver: ResizeObserver | null = null;

  function padRows(rows: DictionaryEntry[]): DictionaryEntry[] {
    while (rows.length < minRows) rows.push(emptyEntry());
    return rows;
  }

  function bulkFields(): { source: HTMLTextAreaElement; target: HTMLTextAreaElement } | null {
    const source = container.querySelector<HTMLTextAreaElement>("#glossary-bulk-source");
    const target = container.querySelector<HTMLTextAreaElement>("#glossary-bulk-target");
    return source && target ? { source, target } : null;
  }

  function updateBulkCount(): void {
    const fields = bulkFields();
    const counter = container.querySelector<HTMLElement>("#glossary-bulk-count");
    if (!fields || !counter) return;
    const pairs = pairLines(fields.source.value, fields.target.value);
    const matched = pairs.filter((pair) => pair.source && pair.target).length;
    const broken = pairs.filter((pair) => Boolean(pair.source) !== Boolean(pair.target)).length;
    counter.classList.toggle("glossary__bulk-count--mismatch", broken > 0);
    counter.textContent = broken === 0
      ? t("glossary.bulkCount", { source: matched, target: matched })
      : t("glossary.bulkCountMismatch", { source: matched, target: matched, excluded: broken });
  }

  function syncBulkHeights(fields: { source: HTMLTextAreaElement; target: HTMLTextAreaElement }): void {
    heightObserver?.disconnect();
    let syncing = false;
    heightObserver = new ResizeObserver((observed) => {
      if (syncing) return;
      syncing = true;
      for (const { target } of observed) {
        const other = target === fields.source ? fields.target : fields.source;
        const height = (target as HTMLElement).offsetHeight;
        if (Math.abs(other.offsetHeight - height) > HEIGHT_SYNC_TOLERANCE_PX) other.style.height = `${height}px`;
      }
      syncing = false;
    });
    heightObserver.observe(fields.source);
    heightObserver.observe(fields.target);
  }

  function render(): void {
    container.innerHTML = `
      <div class="glossary__toolbar">
        <div class="glossary__toolbar-group">
          <span class="muted">${t("glossary.label")}</span>
          <button type="button" class="action-pill" data-action="import">${t("history.import")}</button>
        </div>
        <button type="button" class="secondary" data-action="toggle-mode">${bulkMode ? t("glossary.toggleToRows") : t("glossary.toggleToBulk")}</button>
      </div>
      ${bulkMode ? renderBulk(entries) : renderRows(entries)}
      ${bulkMode ? "" : `<button type="button" class="secondary glossary__add" data-action="add-row">${t("glossary.addRow")}</button>`}
    `;
    const fields = bulkFields();
    if (fields) {
      updateBulkCount();
      syncBulkHeights(fields);
    }
  }

  function leaveBulkMode(): void {
    const fields = bulkFields();
    if (!fields) return;
    entries = padRows(pairLines(fields.source.value, fields.target.value).filter((entry) => entry.source || entry.target));
    onChange?.();
  }

  function importFromHistory(): void {
    openHistoryImportModal("glossary", ({ glossary }) => {
      if (!glossary) return;
      entries = padRows(glossaryToEntries(glossary));
      bulkMode = false;
      render();
      onChange?.();
    });
  }

  function handleAction(action: string): void {
    if (action === "import") {
      importFromHistory();
      return;
    }
    if (action === "toggle-mode") {
      if (bulkMode) leaveBulkMode();
      bulkMode = !bulkMode;
    } else if (action === "add-row") {
      entries.push(emptyEntry());
    }
    render();
  }

  function removeRow(index: number): void {
    entries.splice(index, 1);
    padRows(entries);
    onChange?.();
    render();
  }

  function editRowField(input: HTMLInputElement, field: EntryField): void {
    const cleaned = stripEmoji(input.value);
    if (cleaned !== input.value) input.value = cleaned;
    entries[Number(input.closest<HTMLElement>(".glossary__row")!.dataset.index)][field] = cleaned;
    onChange?.();
  }

  function editBulk(): void {
    const fields = bulkFields()!;
    entries = pairLines(fields.source.value, fields.target.value);
    onChange?.();
    updateBulkCount();
  }

  container.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    const removeIndex = target.closest<HTMLElement>("[data-remove]")?.dataset.remove;
    if (action) handleAction(action);
    else if (removeIndex !== undefined) removeRow(Number(removeIndex));
  }, { signal });

  container.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.classList.contains("glossary__source")) editRowField(target, "source");
    else if (target.classList.contains("glossary__target")) editRowField(target, "target");
    else if (target.id === "glossary-bulk-source" || target.id === "glossary-bulk-target") editBulk();
  }, { signal });

  const unsubscribeLocale = onLocaleChange(render);
  signal?.addEventListener("abort", () => {
    unsubscribeLocale();
    heightObserver?.disconnect();
  }, { once: true });

  render();

  return {
    getEntries: () => entries.filter((entry) => entry.source.trim() && entry.target.trim()),
    setEntries(next) {
      entries = padRows([...next]);
      bulkMode = false;
      render();
    },
  };
}
