import { DictionaryEntry, glossaryToEntries } from '../utils/dictionary';
import { t, onLocaleChange } from "../i18n";
import { openHistoryImportModal } from "./historyImportModal";
import { emptyEntry, pairLines, renderGlossary, stripEmoji } from "./glossaryMarkup";

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

export function mountGlossaryEditor(container: HTMLElement, initialEntries: DictionaryEntry[], options: GlossaryEditorOptions = {}): GlossaryEditorHandle {
  const { onChange, minRows = 1, signal } = options;
  let entries = padRows([...initialEntries]);
  let bulkMode = false;

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

  container.classList.add("glossary");

  function render(): void {
    container.innerHTML = renderGlossary(entries, bulkMode);
    updateBulkCount();
  }

  function leaveBulkMode(): void {
    const fields = bulkFields();
    if (!fields) return;
    entries = padRows(pairLines(fields.source.value, fields.target.value).filter((entry) => entry.source || entry.target));
    onChange?.();
  }

  function setMode(bulk: boolean): void {
    if (bulk === bulkMode) return;
    if (bulkMode) leaveBulkMode();
    bulkMode = bulk;
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

  function focusField(selector: string): void {
    container.querySelector<HTMLElement>(selector)?.focus();
  }

  function handleAction(action: string): void {
    if (action === "import") {
      importFromHistory();
      return;
    }
    let focusSelector = `[data-action="${action}"]`;
    if (action === "mode-rows" || action === "mode-bulk") {
      setMode(action === "mode-bulk");
    } else if (action === "add-row") {
      entries.push(emptyEntry());
      focusSelector = ".glossary__row:last-child .glossary__source";
    }
    render();
    focusField(focusSelector);
  }

  function removeRow(index: number): void {
    entries.splice(index, 1);
    padRows(entries);
    onChange?.();
    render();
    focusField(`.glossary__row[data-index="${Math.min(index, entries.length - 1)}"] .glossary__source`);
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
  signal?.addEventListener("abort", unsubscribeLocale, { once: true });

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
