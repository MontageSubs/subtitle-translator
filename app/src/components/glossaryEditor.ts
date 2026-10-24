import { DictionaryEntry, glossaryToEntries } from '../utils/dictionary';
import { t, onLocaleChange } from "../i18n";
import { openHistoryImportModal } from "./historyImportModal";
import { mountConfirmButton } from "./confirmButton";
import { CLOSE_ICON, UNDO_ICON, renderCheckIcon } from "../render/icons";
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
  const pendingRemoval = new Set<DictionaryEntry>();

  function isBlank(entry: DictionaryEntry): boolean {
    return !entry.source.trim() && !entry.target.trim();
  }

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
    counter.classList.toggle("field__counter--warning", broken > 0);
    counter.textContent = broken === 0
      ? t("glossary.bulkCount", { count: matched })
      : t("glossary.bulkCountMismatch", { count: matched, excluded: broken });
  }

  container.classList.add("glossary");

  function commitRemovals(): void {
    if (!pendingRemoval.size) return;
    entries = padRows(entries.filter((entry) => !pendingRemoval.has(entry)));
    pendingRemoval.clear();
  }

  function setRowRemoved(row: HTMLElement, removed: boolean): void {
    row.classList.toggle("glossary__row--removed", removed);
    row.querySelectorAll<HTMLInputElement>("input").forEach((input) => { input.disabled = removed; });
  }

  function mountRemoveButtons(): void {
    container.querySelectorAll<HTMLButtonElement>(".glossary__remove").forEach((button) => {
      const row = button.closest<HTMLElement>(".glossary__row")!;
      const entry = entries[Number(row.dataset.index)];
      const idleLabel = button.getAttribute("aria-label") ?? "";
      mountConfirmButton({
        button,
        idleText: () => idleLabel,
        confirmText: () => t("glossary.removeConfirm"),
        icons: { idle: CLOSE_ICON, confirm: renderCheckIcon(16), undo: UNDO_ICON },
        skipWhen: () => isBlank(entry),
        onConfirm: () => {
          if (isBlank(entry)) pendingRemoval.add(entry);
          if (!pendingRemoval.has(entry)) return;
          commitRemovals();
          render();
          onChange?.();
        },
        undo: {
          text: () => t("common.undo"),
          onPending: () => {
            pendingRemoval.add(entry);
            setRowRemoved(row, true);
            onChange?.();
          },
          onCancel: () => {
            pendingRemoval.delete(entry);
            setRowRemoved(row, false);
            onChange?.();
          },
        },
        signal,
      });
    });
  }

  function render(): void {
    commitRemovals();
    container.innerHTML = renderGlossary(entries, bulkMode);
    updateBulkCount();
    mountRemoveButtons();
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
    if (action) handleAction(action);
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
    getEntries: () => entries.filter((entry) => !pendingRemoval.has(entry) && entry.source.trim() && entry.target.trim()),
    setEntries(next) {
      entries = padRows([...next]);
      bulkMode = false;
      render();
    },
  };
}
