import { getLocale, t } from "../i18n";
import { languageLabel } from "../utils/languageProfiles";
import { languagePinyinInitials, languageZhuyinInitials } from "../utils/languageNames";
import { escapeHtml } from "../utils/escapeHtml";
import { CHEVRON_DOWN_ICON } from "../render/icons";

export interface LanguageSelectEntry {
  code: string;
  label?: string;
  onSelect?: () => void;
}

export interface LanguageSelectOptions {
  select: HTMLSelectElement;
  container: HTMLElement;
  entries: LanguageSelectEntry[];
  quickCodes?: string[];
  pinnedEntries?: LanguageSelectEntry[];
  excludeCode?: () => string | undefined;
  supportedCodes?: () => Set<string> | undefined;
  searchPlaceholder?: string;
  ariaLabelledBy?: string;
  signal?: AbortSignal;
}

export interface LanguageSelectHandle {
  refresh(): void;
  setValue(code: string): void;
}

function matchesQuery(entry: LanguageSelectEntry, label: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (label.toLowerCase().includes(needle) || entry.code.toLowerCase().includes(needle)) return true;
  switch (getLocale()) {
    case "zh-Hans": return languagePinyinInitials(entry.code).toLowerCase().includes(needle);
    case "zh-Hant": return Boolean(languageZhuyinInitials(entry.code)?.includes(query.trim()));
    default: return false;
  }
}

export function mountLanguageSelect(options: LanguageSelectOptions): LanguageSelectHandle {
  const { select, container, entries, quickCodes = [], pinnedEntries = [], excludeCode, supportedCodes, searchPlaceholder = "", ariaLabelledBy, signal } = options;
  const allEntries = [...pinnedEntries, ...entries];
  const labelledBy = ariaLabelledBy ? ` aria-labelledby="${ariaLabelledBy}"` : "";
  const listId = `${select.id || "lang"}-listbox`;

  container.classList.add("lang-combo");
  container.innerHTML = `
    <button type="button" class="lang-combo__trigger" aria-haspopup="listbox" aria-expanded="false"${labelledBy}>
      <span class="lang-combo__trigger-label"></span>
      ${CHEVRON_DOWN_ICON}
    </button>
    <div class="lang-combo__panel" hidden>
      <input type="text" class="lang-combo__search" role="combobox" aria-expanded="true" aria-controls="${listId}" aria-autocomplete="list" aria-activedescendant="" placeholder="${escapeHtml(searchPlaceholder)}" aria-label="${escapeHtml(searchPlaceholder)}" autocomplete="off" spellcheck="false" />
      <ul class="lang-combo__list" id="${listId}" role="listbox"></ul>
    </div>
  `;

  const trigger = container.querySelector<HTMLButtonElement>(".lang-combo__trigger")!;
  const triggerLabel = container.querySelector<HTMLElement>(".lang-combo__trigger-label")!;
  const panel = container.querySelector<HTMLElement>(".lang-combo__panel")!;
  const search = container.querySelector<HTMLInputElement>(".lang-combo__search")!;
  const list = container.querySelector<HTMLUListElement>(".lang-combo__list")!;

  let highlightedIndex = 0;

  const findEntry = (code: string) => allEntries.find((entry) => entry.code === code);
  const entryLabel = (entry: LanguageSelectEntry) => entry.label ?? languageLabel(entry.code);

  function renderOption(entry: LanguageSelectEntry): string {
    const active = entry.code === select.value;
    const code = entry.label ? "" : ` <span class="lang-combo__option-code">${entry.code}</span>`;
    return `<li role="option" id="${listId}-${entry.code}" class="lang-combo__option${active ? " lang-combo__option--active" : ""}" data-code="${entry.code}" aria-selected="${active}">${entryLabel(entry)}${code}</li>`;
  }

  function optionElements(): HTMLElement[] {
    return Array.from(list.querySelectorAll<HTMLElement>("[data-code]"));
  }

  function highlight(index: number): void {
    const options = optionElements();
    if (!options.length) {
      search.setAttribute("aria-activedescendant", "");
      return;
    }
    highlightedIndex = Math.min(Math.max(index, 0), options.length - 1);
    options.forEach((option, position) => option.classList.toggle("lang-combo__option--highlight", position === highlightedIndex));
    const current = options[highlightedIndex];
    search.setAttribute("aria-activedescendant", current.id);
    current.scrollIntoView({ block: "nearest" });
  }

  function sortedByLabel(candidates: LanguageSelectEntry[]): LanguageSelectEntry[] {
    const collator = new Intl.Collator(getLocale());
    return [...candidates].sort((a, b) => collator.compare(entryLabel(a), entryLabel(b)));
  }

  function availableEntries(): LanguageSelectEntry[] {
    const excluded = excludeCode?.();
    const supported = supportedCodes?.();
    return entries.filter((entry) => entry.code !== excluded && (!supported || supported.has(entry.code)));
  }

  function renderGroupedList(available: LanguageSelectEntry[]): string {
    const quickSet = new Set(quickCodes);
    const quickEntries = quickCodes.flatMap((code) => available.filter((entry) => entry.code === code));
    const rest = available.filter((entry) => !quickSet.has(entry.code));
    const quickGroup = quickEntries.length
      ? `<li class="lang-combo__group-label">${t("languageSelect.quickPicks")}</li>${quickEntries.map(renderOption).join("")}<li class="lang-combo__group-label">${t("languageSelect.allLanguages")}</li>`
      : "";
    return pinnedEntries.map(renderOption).join("") + quickGroup + sortedByLabel(rest).map(renderOption).join("");
  }

  function renderList(query: string): void {
    const available = availableEntries();
    if (!query) {
      list.innerHTML = renderGroupedList(available);
    } else {
      const matches = sortedByLabel(available).filter((entry) => matchesQuery(entry, entryLabel(entry), query));
      list.innerHTML = matches.map(renderOption).join("") || `<li class="lang-combo__empty">—</li>`;
    }
    highlight(0);
  }

  function syncTriggerLabel(): void {
    const current = findEntry(select.value);
    triggerLabel.textContent = current ? entryLabel(current) : select.value;
  }

  function setPanelOpen(open: boolean): void {
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (!open) return;
    search.value = "";
    renderList("");
    search.focus();
  }

  function applyValue(code: string): void {
    select.value = code;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncTriggerLabel();
  }

  function selectCode(code: string): void {
    setPanelOpen(false);
    trigger.focus();
    const entry = findEntry(code);
    if (entry?.onSelect) entry.onSelect();
    else applyValue(code);
  }

  trigger.addEventListener("click", () => setPanelOpen(panel.hidden), { signal });
  search.addEventListener("input", () => renderList(search.value), { signal });
  list.addEventListener("click", (event) => {
    const code = (event.target as HTMLElement).closest<HTMLElement>("[data-code]")?.dataset.code;
    if (code) selectCode(code);
  }, { signal });
  search.addEventListener("keydown", (event) => {
    const lastIndex = optionElements().length - 1;
    const moves: Record<string, number> = { ArrowDown: highlightedIndex + 1, ArrowUp: highlightedIndex - 1, Home: 0, End: lastIndex };
    if (Object.hasOwn(moves, event.key)) {
      event.preventDefault();
      highlight(moves[event.key]);
    } else if (event.key === "Escape") {
      setPanelOpen(false);
      trigger.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const code = optionElements()[highlightedIndex]?.dataset.code;
      if (code) selectCode(code);
    }
  }, { signal });
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    setPanelOpen(true);
  }, { signal });
  document.addEventListener("click", (event) => {
    if (!container.contains(event.target as Node)) setPanelOpen(false);
  }, { signal });

  syncTriggerLabel();

  return { refresh: syncTriggerLabel, setValue: applyValue };
}
