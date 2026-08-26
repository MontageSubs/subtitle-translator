import { DictionaryEntry } from "../core/dictionary";
import { t, onLocaleChange } from "../i18n";

const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

function stripEmoji(value: string): string {
  return value.replace(EMOJI_PATTERN, "");
}

export interface GlossaryEditorHandle {
  getEntries(): DictionaryEntry[];
  setEntries(entries: DictionaryEntry[]): void;
}

export function mountGlossaryEditor(container: HTMLElement, initialEntries: DictionaryEntry[]): GlossaryEditorHandle {
  let entries: DictionaryEntry[] = initialEntries.length ? [...initialEntries] : [{ source: "", target: "" }];
  let bulkMode = false;

  function render() {
    container.innerHTML = `
      <div class="glossary__toolbar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="muted">${t("glossary.label")}</span>
          <button type="button" class="ghost-btn ghost-btn--mini" disabled>${t("history.import")}</button>
        </div>
        <button type="button" class="secondary" id="glossary-mode-toggle">${bulkMode ? t("glossary.toggleToRows") : t("glossary.toggleToBulk")}</button>
      </div>
      ${bulkMode ? renderBulk() : renderRows()}
      ${bulkMode ? "" : `<button type="button" class="secondary glossary__add" id="glossary-add-row">${t("glossary.addRow")}</button>`}
    `;

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
      <div class="glossary__row" data-index="${i}">
        <input type="text" class="glossary__source" value="${escapeAttr(entry.source)}" placeholder="${t("glossary.sourcePlaceholder")}" />
        <span class="glossary__arrow">→</span>
        <input type="text" class="glossary__target" value="${escapeAttr(entry.target)}" placeholder="${t("glossary.targetPlaceholder")}" />
        <button type="button" class="glossary__remove" aria-label="${t("glossary.remove")}" data-remove="${i}">✕</button>
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
        entries[i].source = cleaned;
      });
    });
    container.querySelectorAll<HTMLInputElement>(".glossary__target").forEach((input) => {
      input.addEventListener("input", () => {
        const cleaned = stripEmoji(input.value);
        if (cleaned !== input.value) input.value = cleaned;
        const i = Number(input.closest<HTMLElement>(".glossary__row")!.dataset.index);
        entries[i].target = cleaned;
      });
    });
    container.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        entries.splice(Number(btn.dataset.remove), 1);
        if (!entries.length) entries.push({ source: "", target: "" });
        render();
      });
    });
  }

  function wireBulkTextareas() {
    const src = container.querySelector<HTMLTextAreaElement>("#glossary-bulk-source")!;
    const dst = container.querySelector<HTMLTextAreaElement>("#glossary-bulk-target")!;
    const sync = () => {
      const sourceLines = src.value.split("\n");
      const targetLines = dst.value.split("\n");
      const len = Math.max(sourceLines.length, targetLines.length);
      entries = Array.from({ length: len }, (_, i) => ({
        source: (sourceLines[i] || "").trim(),
        target: (targetLines[i] || "").trim(),
      }));
    };
    src.addEventListener("input", sync);
    dst.addEventListener("input", sync);
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
    if (!entries.length) entries.push({ source: "", target: "" });
  }

  render();
  onLocaleChange(() => render());

  return {
    getEntries: () => entries.filter((e) => e.source.trim()),
    setEntries: (next: DictionaryEntry[]) => {
      entries = next.length ? [...next] : [{ source: "", target: "" }];
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
