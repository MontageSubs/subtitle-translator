import { getLocale } from "../i18n";
import { languageName } from "../utils/languageNames";
import { matchesLanguageQuery } from "../utils/languageSearch";
import { escapeHtml } from "../utils/escapeHtml";
import { labelAttrs } from "../utils/labelAttrs";
import { t } from "../i18n";
import { CHEVRON_DOWN_ICON, CLOSE_ICON } from "../render/icons";
import { renderLanguageList, LanguageEntry } from "./languageList";

interface LanguageSelectOptions {
  select: HTMLSelectElement;
  container: HTMLElement;
  entries: LanguageEntry[];
  featured?: () => LanguageEntry[];
  featuredLabel?: string;
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

function renderShell(listId: string, searchPlaceholder: string, ariaLabelledBy?: string): string {
  const labelledBy = ariaLabelledBy ? ` aria-labelledby="${ariaLabelledBy}"` : "";
  const placeholder = escapeHtml(searchPlaceholder);
  return `
    <button type="button" class="lang-combo__trigger" aria-haspopup="listbox" aria-expanded="false"${labelledBy}>
      <span class="lang-combo__trigger-label"></span>
      ${CHEVRON_DOWN_ICON}
    </button>
    <div class="lang-combo__panel" hidden>
      <div class="input-with-clear lang-combo__search-wrap">
        <input type="text" class="lang-combo__search" role="combobox" aria-expanded="true" aria-controls="${listId}" aria-autocomplete="list" aria-activedescendant="" placeholder="${placeholder}" aria-label="${placeholder}" autocomplete="off" spellcheck="false" />
        <button type="button" class="input-clear-btn lang-combo__clear" ${labelAttrs(t("preview.clearSearch"))}>${CLOSE_ICON}</button>
      </div>
      <ul class="lang-combo__list" id="${listId}" role="listbox"></ul>
    </div>
  `;
}

export function mountLanguageSelect(options: LanguageSelectOptions): LanguageSelectHandle {
  const { select, container, entries, featured, featuredLabel = "", excludeCode, supportedCodes, searchPlaceholder = "", ariaLabelledBy, signal } = options;
  const listId = `${select.id || "lang"}-listbox`;

  container.classList.add("lang-combo");
  container.innerHTML = renderShell(listId, searchPlaceholder, ariaLabelledBy);

  const trigger = container.querySelector<HTMLButtonElement>(".lang-combo__trigger")!;
  const triggerLabel = container.querySelector<HTMLElement>(".lang-combo__trigger-label")!;
  const panel = container.querySelector<HTMLElement>(".lang-combo__panel")!;
  const search = container.querySelector<HTMLInputElement>(".lang-combo__search")!;
  const list = container.querySelector<HTMLUListElement>(".lang-combo__list")!;
  const clearButton = container.querySelector<HTMLButtonElement>(".lang-combo__clear")!;

  let highlightedIndex = -1;

  const entryLabel = (entry: LanguageEntry) => entry.label ?? languageName(entry.code, getLocale());

  function availableEntries(): LanguageEntry[] {
    const excluded = excludeCode?.();
    const supported = supportedCodes?.();
    const collator = new Intl.Collator(getLocale());
    return entries
      .filter((entry) => entry.code !== excluded && (!supported || supported.has(entry.code)))
      .sort((a, b) => collator.compare(entryLabel(a), entryLabel(b)));
  }

  function featuredEntries(available: LanguageEntry[]): LanguageEntry[] {
    const availableCodes = new Set(available.map((entry) => entry.code));
    return (featured?.() ?? []).filter((entry) => entry.label !== undefined || availableCodes.has(entry.code));
  }

  function findEntry(code: string): LanguageEntry | undefined {
    return [...(featured?.() ?? []), ...entries].find((entry) => entry.code === code);
  }

  function optionElements(): HTMLElement[] {
    return Array.from(list.querySelectorAll<HTMLElement>("[data-code]"));
  }

  function activeIndex(): number {
    return optionElements().findIndex((option) => option.classList.contains("lang-combo__option--active"));
  }

  function highlight(index: number): void {
    const options = optionElements();
    highlightedIndex = options.length ? Math.min(Math.max(index, -1), options.length - 1) : -1;
    options.forEach((option, position) => option.classList.toggle("lang-combo__option--highlight", position === highlightedIndex));
    const current = options[highlightedIndex];
    search.setAttribute("aria-activedescendant", current?.id ?? "");
    current?.scrollIntoView({ block: "nearest" });
  }

  function renderList(query: string): void {
    const available = availableEntries();
    list.innerHTML = renderLanguageList({
      listId,
      activeCode: select.value,
      all: query ? available.filter((entry) => matchesLanguageQuery(entry.code, query)) : available,
      featured: query ? [] : featuredEntries(available),
      featuredLabel,
      labelOf: entryLabel,
    });
    highlightedIndex = -1;
    search.setAttribute("aria-activedescendant", "");
  }

  function syncTriggerLabel(): void {
    const current = findEntry(select.value);
    triggerLabel.textContent = current ? entryLabel(current) : select.value;
    trigger.title = triggerLabel.textContent;
  }

  function setPanelOpen(open: boolean, viaKeyboard = false): void {
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (!open) return;
    search.value = "";
    renderList("");
    search.focus();
    if (viaKeyboard) highlight(Math.max(activeIndex(), 0));
    else optionElements()[activeIndex()]?.scrollIntoView({ block: "nearest" });
  }

  function applyQuery(): void {
    renderList(search.value);
    if (search.value.trim()) highlight(0);
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

  function onSearchKey(event: KeyboardEvent): void {
    const count = optionElements().length;
    const anchor = highlightedIndex >= 0 ? highlightedIndex : activeIndex();
    const moves: Record<string, number> = {
      ArrowDown: highlightedIndex < 0 && anchor >= 0 ? anchor : highlightedIndex + 1,
      ArrowUp: highlightedIndex < 0 ? (anchor >= 0 ? anchor : count - 1) : highlightedIndex - 1,
      Home: 0,
      End: count - 1,
    };
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
  }

  trigger.addEventListener("click", (event) => setPanelOpen(panel.hidden, event.detail === 0), { signal });
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    setPanelOpen(true, true);
  }, { signal });
  search.addEventListener("input", applyQuery, { signal });
  search.addEventListener("keydown", onSearchKey, { signal });
  clearButton.addEventListener("click", () => {
    search.value = "";
    applyQuery();
    search.focus();
  }, { signal });
  list.addEventListener("pointermove", () => {
    if (highlightedIndex >= 0) highlight(-1);
  }, { signal });
  list.addEventListener("click", (event) => {
    const code = (event.target as HTMLElement).closest<HTMLElement>("[data-code]")?.dataset.code;
    if (code) selectCode(code);
  }, { signal });
  document.addEventListener("click", (event) => {
    if (!container.contains(event.target as Node)) setPanelOpen(false);
  }, { signal });

  syncTriggerLabel();

  return { refresh: syncTriggerLabel, setValue: applyValue };
}
