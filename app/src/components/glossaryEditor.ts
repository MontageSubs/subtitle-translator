import { DictionaryEntry, glossaryToEntries } from '../utils/dictionary';
import { t, onLocaleChange } from "../i18n";
import { CLOSE_ICON } from "../render/icons";
import { openHistoryImportModal } from "./historyImportModal";

const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

function stripEmoji(value: string): string {
  return value.replace(EMOJI_PATTERN, "");
}

export interface GlossaryEditorHandle {
  getEntries(): DictionaryEntry[];
  setEntries(entries: DictionaryEntry[]): void;
}

export function mountGlossaryEditor(container: HTMLElement, initialEntries: DictionaryEntry[], onChange?: () => void): GlossaryEditorHandle {
  let entries: DictionaryEntry[] = initialEntries.length ? [...initialEntries] : [];
  while (entries.length < 3) entries.push({ source: "", target: "" });
  let bulkMode = false;

  function notifyChange() {
    if (onChange) onChange();
  }

  function render() {
    container.innerHTML = `
      <div class="glossary__toolbar">
        <div class="glossary__toolbar-group">
          <span class="muted">${t("glossary.label")}</span>
          <button type="button" class="ghost-btn ghost-btn--mini" id="glossary-history-import">${t("history.import")}</button>
        </div>
        <button type="button" class="secondary" id="glossary-mode-toggle">${bulkMode ? t("glossary.toggleToRows") : t("glossary.toggleToBulk")}</button>
      </div>
      ${bulkMode ? renderBulk() : renderRows()}
      ${bulkMode ? "" : `<button type="button" class="secondary glossary__add" id="glossary-add-row">${t("glossary.addRow")}</button>`}
    `;

    container.querySelector<HTMLButtonElement>("#glossary-history-import")?.addEventListener("click", () => {
      openHistoryImportModal("glossary", (res) => {
        if (res.glossary) {
          entries = glossaryToEntries(res.glossary);
          if (entries.length < 8) { while(entries.length < 8) entries.push({ source: "", target: "" }); }
          bulkMode = false;
          render();
          notifyChange();
        }
      });
    });

    container.querySelector<HTMLButtonElement>("#glossary-mode-toggle")!.addEventListener("click", () => {
      if (bulkMode) collapseBulkIntoRows();
      bulkMode = !bulkMode;
      render();
    });

    if (bulkMode) {
      wireBulkTextareas();
    } else {
      wireRows();
      container.querySelector<HTMLButtonElement>("#glossary-add-row")?.addEventListener("click", () => {
        entries.push({ source: "", target: "" });
        render();
      });
    }
  }

  function renderRows(): string {
    return `<div class="glossary__rows">${entries
      .map(
        (entry, i) => `
      <div class="glossary__row ${!entry.source && !entry.target ? 'glossary__row--empty' : ''}" data-index="${i}">
        <input type="text" class="glossary__source" value="${escapeAttr(entry.source)}" placeholder="${t("glossary.sourcePlaceholder")}" />
        <span class="glossary__arrow" aria-hidden="true">→</span>
        <input type="text" class="glossary__target" value="${escapeAttr(entry.target)}" placeholder="${t("glossary.targetPlaceholder")}" />
        <button type="button" class="icon-btn glossary__remove" aria-label="${t("glossary.remove")}" data-remove="${i}">${CLOSE_ICON}</button>
      </div>`
      )
      .join("")}</div>`;
  }

  function renderBulk(): string {
    const sourceLines = entries.map((e) => e.source).join("\n");
    const targetLines = entries.map((e) => e.target).join("\n");
    return `<div class="glossary__bulk">
      <textarea id="glossary-bulk-source" placeholder="${t("glossary.bulkSourcePlaceholder")}">${escapeText(sourceLines)}</textarea>
      <span class="glossary__bulk-arrow" aria-hidden="true">→</span>
      <textarea id="glossary-bulk-target" placeholder="${t("glossary.bulkTargetPlaceholder")}">${escapeText(targetLines)}</textarea>
    </div>`;
  }

  function wireRows() {
    container.querySelectorAll<HTMLInputElement>(".glossary__source").forEach((input) => {
      input.addEventListener("input", () => {
        const cleaned = stripEmoji(input.value);
        if (cleaned !== input.value) input.value = cleaned;
        const i = Number(input.closest<HTMLElement>(".glossary__row")!.dataset.index);
        entries[i].source = cleaned; notifyChange();
      });
    });
    container.querySelectorAll<HTMLInputElement>(".glossary__target").forEach((input) => {
      input.addEventListener("input", () => {
        const cleaned = stripEmoji(input.value);
        if (cleaned !== input.value) input.value = cleaned;
        const i = Number(input.closest<HTMLElement>(".glossary__row")!.dataset.index);
        entries[i].target = cleaned; notifyChange();
      });
    });
    container.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        entries.splice(Number(btn.dataset.remove), 1);
        if (!entries.length) entries.push({ source: "", target: "" }); notifyChange();
        render();
      });
    });
  }

  function wireBulkTextareas() {
    const src = container.querySelector<HTMLTextAreaElement>("#glossary-bulk-source")!;
    const dst = container.querySelector<HTMLTextAreaElement>("#glossary-bulk-target")!;
    if (!src || !dst) return;

    const sync = () => {
      const sourceLines = src.value.split("\n");
      const targetLines = dst.value.split("\n");
      const len = Math.max(sourceLines.length, targetLines.length);
      entries = Array.from({ length: len }, (_, i) => ({
        source: (sourceLines[i] || "").trim(),
        target: (targetLines[i] || "").trim(),
      })); notifyChange();
    };
    src.addEventListener("input", sync);
    dst.addEventListener("input", sync);

    let syncingHeight = false;
    const observer = new ResizeObserver((observedEntries) => {
      if (syncingHeight) return;
      syncingHeight = true;
      for (const entry of observedEntries) {
        const target = entry.target as HTMLTextAreaElement;
        const other = target === src ? dst : src;
        if (target && other) {
          const newHeight = target.offsetHeight;
          if (Math.abs(other.offsetHeight - newHeight) > 1) {
            other.style.height = `${newHeight}px`;
          }
        }
      }
      syncingHeight = false;
    });
    observer.observe(src);
    observer.observe(dst);
  }

  function collapseBulkIntoRows() {
    const src = container.querySelector<HTMLTextAreaElement>("#glossary-bulk-source");
    const dst = container.querySelector<HTMLTextAreaElement>("#glossary-bulk-target");
    if (!src || !dst) return;
    const sourceLines = src.value.split("\n");
    const targetLines = dst.value.split("\n");
    const len = Math.max(sourceLines.length, targetLines.length);
    entries = Array.from({ length: len }, (_, i) => ({
      source: stripEmoji((sourceLines[i] || "").trim()),
      target: stripEmoji((targetLines[i] || "").trim()),
    })).filter((e) => e.source || e.target);
    if (!entries.length) entries.push({ source: "", target: "" }); notifyChange();
  }

  render();
  onLocaleChange(() => render());

  return {
    getEntries: () => entries.filter((e) => e.source.trim()),
    setEntries: (next: DictionaryEntry[]) => {
      entries = next.length ? [...next] : []; while (entries.length < 3) entries.push({ source: "", target: "" });
      bulkMode = false;
      render();
    },
  };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
