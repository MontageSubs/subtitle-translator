import { DictionaryEntry, glossaryToEntries } from '../utils/dictionary';
import { t, onLocaleChange } from "../i18n";
import { openHistoryImportModal } from "./historyImportModal";
import { UNDO_WINDOW_MS, mountConfirmButton } from "./confirmButton";
import { CLOSE_ICON, UNDO_ICON } from "../render/icons";
import { orderRelatedTerms } from "../lib/entities/termOrder";
import { emptyEntry, pairLines, renderGlossary, stripEmoji, type GlossaryFooterSlot } from "./glossaryMarkup";

export interface PendingTerm {
  id: string;
  source: string;
}

export interface ResolvedTerm extends PendingTerm {
  target: string | null;
}

export interface GlossaryBuffer {
  entries: DictionaryEntry[];
  recognized: DictionaryEntry[];
  edited: DictionaryEntry[];
}

export interface GlossaryEditorHandle {
  captureBuffer(): GlossaryBuffer;
  loadBuffer(buffer: GlossaryBuffer): void;
  getEntries(): DictionaryEntry[];
  getDraftEntries(): DictionaryEntry[];
  setEntries(entries: DictionaryEntry[]): void;
  appendPending(sources: readonly string[]): void;
  recognizedTerms(): DictionaryEntry[];
  retarget(lookup: (source: string) => string | null): void;
  sortRecognized(): void;
  pendingTerms(): PendingTerm[];
  resolvePending(terms: readonly ResolvedTerm[]): void;
  requeueRecognized(): void;
  attachFooterSlot(slot: GlossaryFooterSlot): void;
}

export interface GlossaryEditorOptions {
  onChange?: () => void;
  minRows?: number;
  signal?: AbortSignal;
}

type EntryField = keyof DictionaryEntry;

const EDITOR_ACTIONS: ReadonlySet<string> = new Set(["import", "mode-rows", "mode-bulk", "add-row"]);

export function mountGlossaryEditor(container: HTMLElement, initialEntries: DictionaryEntry[], options: GlossaryEditorOptions = {}): GlossaryEditorHandle {
  const { onChange, minRows = 1, signal } = options;
  let entries = padRows([...initialEntries]);
  let bulkMode = false;
  let composing = false;
  let renderQueued = false;
  let autoSequence = 0;
  let footerSlot: GlossaryFooterSlot | null = null;
  const autoIds = new Map<DictionaryEntry, string>();
  const recognized = new Set<DictionaryEntry>();
  const edited = new Set<DictionaryEntry>();
  const pendingRemovals = new Map<DictionaryEntry, number>();
  let removeScope = new AbortController();
  signal?.addEventListener("abort", () => removeScope.abort(), { once: true });

  function isBlank(entry: DictionaryEntry): boolean {
    return !entry.source.trim() && !entry.target.trim();
  }

  function isAwaitingTranslation(entry: DictionaryEntry): boolean {
    return !pendingRemovals.has(entry) && Boolean(entry.source.trim()) && !entry.target.trim();
  }

  function idOf(entry: DictionaryEntry): string {
    let id = autoIds.get(entry);
    if (!id) {
      id = `term-${++autoSequence}`;
      autoIds.set(entry, id);
    }
    return id;
  }

  function awaitingEntries(): DictionaryEntry[] {
    return entries.filter(isAwaitingTranslation);
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

  function entryOf(element: HTMLElement): DictionaryEntry {
    return entries[Number(element.closest<HTMLElement>(".glossary__row")!.dataset.index)];
  }

  function settlePendingRemovals(): void {
    if (!pendingRemovals.size) return;
    pendingRemovals.forEach((_, entry) => {
      autoIds.delete(entry);
      recognized.delete(entry);
      edited.delete(entry);
    });
    entries = padRows(entries.filter((entry) => !pendingRemovals.has(entry)));
    pendingRemovals.clear();
  }

  function removeEntry(entry: DictionaryEntry): void {
    pendingRemovals.delete(entry);
    autoIds.delete(entry);
    recognized.delete(entry);
    edited.delete(entry);
    if (!entries.includes(entry)) return;
    entries = padRows(entries.filter((candidate) => candidate !== entry));
    render();
    onChange?.();
  }

  function setRowRemoved(row: HTMLElement, removed: boolean): void {
    row.classList.toggle("glossary__row--removed", removed);
    row.querySelectorAll<HTMLInputElement>("input").forEach((input) => { input.disabled = removed; });
  }

  function mountRemoveButtons(): void {
    removeScope.abort();
    removeScope = new AbortController();
    container.querySelectorAll<HTMLButtonElement>(".glossary__remove").forEach((button) => {
      const row = button.closest<HTMLElement>(".glossary__row")!;
      const entry = entryOf(row);
      const idleLabel = button.getAttribute("aria-label") ?? "";
      const control = mountConfirmButton({
        button,
        idleText: () => idleLabel,
        icons: { idle: CLOSE_ICON, undo: UNDO_ICON },
        skipWhen: () => isBlank(entry),
        onConfirm: () => removeEntry(entry),
        undo: {
          text: () => t("common.undo"),
          onPending: () => {
            pendingRemovals.set(entry, Date.now() + UNDO_WINDOW_MS);
            setRowRemoved(row, true);
            onChange?.();
          },
          onCancel: () => {
            pendingRemovals.delete(entry);
            setRowRemoved(row, false);
            onChange?.();
          },
        },
        signal: removeScope.signal,
      });
      const deadline = pendingRemovals.get(entry);
      if (deadline === undefined) return;
      setRowRemoved(row, true);
      control.resumePending(Math.max(1, deadline - Date.now()));
    });
  }

  function render(): void {
    const focused = container.querySelector<HTMLInputElement>(".glossary__row input:focus");
    const restore = focused && {
      entry: entryOf(focused),
      selector: focused.classList.contains("glossary__target") ? ".glossary__target" : ".glossary__source",
      start: focused.selectionStart,
      end: focused.selectionEnd,
    };
    container.innerHTML = renderGlossary(entries, bulkMode, new Set(awaitingEntries()), footerSlot);
    updateBulkCount();
    mountRemoveButtons();
    footerSlot?.mounted();
    if (!restore) return;
    const field = container.querySelector<HTMLInputElement>(`.glossary__row[data-index="${entries.indexOf(restore.entry)}"] ${restore.selector}`);
    field?.focus();
    field?.setSelectionRange(restore.start, restore.end);
  }

  function scheduleRender(): void {
    if (composing) renderQueued = true;
    else render();
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
    else settlePendingRemovals();
    bulkMode = bulk;
  }

  function importFromHistory(): void {
    openHistoryImportModal("glossary", ({ glossary }) => {
      if (!glossary) return;
      pendingRemovals.clear();
      autoIds.clear();
      recognized.clear();
      edited.clear();
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
    if (!EDITOR_ACTIONS.has(action)) return;
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
    const entry = entryOf(input);
    entry[field] = cleaned;
    if (field === "target") edited[cleaned.trim() ? "add" : "delete"](entry);
    const row = input.closest<HTMLElement>(".glossary__row");
    const awaiting = isAwaitingTranslation(entry);
    row?.classList.toggle("glossary__row--pending", awaiting);
    row?.querySelector<HTMLInputElement>(".glossary__target")?.setAttribute("placeholder", t(awaiting ? "glossary.pendingPlaceholder" : "glossary.targetPlaceholder"));
    if (field === "target" && cleaned.trim()) autoIds.delete(entry);
    onChange?.();
  }

  function appendPending(sources: readonly string[]): void {
    if (!sources.length) return;
    setMode(false);
    const added = sources.map((source) => {
      const entry = { source, target: "" };
      autoIds.set(entry, `term-${++autoSequence}`);
      recognized.add(entry);
      return entry;
    });
    let insertAt = entries.length;
    while (insertAt > 0 && isBlank(entries[insertAt - 1])) insertAt -= 1;
    entries.splice(insertAt, 0, ...added);
    scheduleRender();
    const rows = container.querySelector<HTMLElement>(".glossary__rows");
    if (rows) rows.scrollTop = rows.scrollHeight;
  }

  const liveRecognized = (): DictionaryEntry[] => entries.filter((entry) => recognized.has(entry) && !pendingRemovals.has(entry));

  function retarget(lookup: (source: string) => string | null): void {
    for (const entry of liveRecognized()) {
      const translated = lookup(entry.source.trim());
      entry.target = translated ?? "";
      edited.delete(entry);
      if (translated) autoIds.delete(entry);
      else idOf(entry);
    }
    scheduleRender();
    onChange?.();
  }

  function requeueRecognized(): void {
    for (const entry of liveRecognized()) {
      if (edited.has(entry)) continue;
      entry.target = "";
      idOf(entry);
    }
    scheduleRender();
    onChange?.();
  }

  function sortRecognized(): void {
    const slots = entries.flatMap((entry, index) => (recognized.has(entry) && !pendingRemovals.has(entry) ? [index] : []));
    const ordered = orderRelatedTerms(slots.map((index) => entries[index]), (entry) => entry.source);
    slots.forEach((index, position) => {
      entries[index] = ordered[position];
    });
    scheduleRender();
  }

  function resolvePending(terms: readonly ResolvedTerm[]): void {
    const byId = new Map([...autoIds].map(([entry, id]) => [id, entry]));
    for (const { id, source, target } of terms) {
      const entry = byId.get(id);
      if (!entry || !isAwaitingTranslation(entry) || entry.source.trim() !== source) continue;
      autoIds.delete(entry);
      if (target === null) {
        recognized.delete(entry);
        edited.delete(entry);
        entries = padRows(entries.filter((candidate) => candidate !== entry));
      } else entry.target = stripEmoji(target);
    }
    scheduleRender();
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

  container.addEventListener("compositionstart", () => {
    composing = true;
  }, { signal });

  container.addEventListener("compositionend", () => {
    composing = false;
    if (!renderQueued) return;
    renderQueued = false;
    render();
  }, { signal });

  const unsubscribeLocale = onLocaleChange(render);
  signal?.addEventListener("abort", unsubscribeLocale, { once: true });

  render();

  function loadBuffer(buffer: GlossaryBuffer): void {
    pendingRemovals.clear();
    autoIds.clear();
    recognized.clear();
    edited.clear();
    buffer.recognized.forEach((entry) => recognized.add(entry));
    buffer.edited.forEach((entry) => edited.add(entry));
    entries = padRows([...buffer.entries]);
    bulkMode = false;
    render();
  }

  function captureBuffer(): GlossaryBuffer {
    const kept = entries.filter((entry) => !pendingRemovals.has(entry) && !isBlank(entry));
    return { entries: kept, recognized: kept.filter((entry) => recognized.has(entry)), edited: kept.filter((entry) => edited.has(entry)) };
  }

  return {
    captureBuffer,
    loadBuffer,
    getEntries: () => entries.filter((entry) => !pendingRemovals.has(entry) && entry.source.trim() && entry.target.trim()),
    getDraftEntries: () => entries.filter((entry) => !pendingRemovals.has(entry) && entry.source.trim()),
    setEntries(next) {
      pendingRemovals.clear();
      autoIds.clear();
      recognized.clear();
      edited.clear();
      entries = padRows([...next]);
      bulkMode = false;
      render();
    },
    appendPending,
    recognizedTerms: liveRecognized,
    retarget,
    sortRecognized,
    pendingTerms: () => awaitingEntries().map((entry) => ({ id: idOf(entry), source: entry.source.trim() })),
    resolvePending,
    requeueRecognized,
    attachFooterSlot(slot) {
      footerSlot = slot;
      render();
    },
  };
}
