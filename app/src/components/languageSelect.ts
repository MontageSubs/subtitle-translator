import { getLocale, t } from "../i18n";
import { languageLabel } from "../utils/languageProfiles";
import { languagePinyinInitials, languageZhuyinInitials } from "../utils/languageNames";
import { CHEVRON_DOWN_ICON } from "../render/icons";

export interface LanguageSelectEntry {
  code: string;
  isAuto?: boolean;
}

interface MountOptions {
  select: HTMLSelectElement;
  container: HTMLElement;
  entries: LanguageSelectEntry[];
  quickCodes?: string[];
  autoLabel?: string;
  searchPlaceholder?: string;
  ariaLabelledBy?: string;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function matchesQuery(entry: LanguageSelectEntry, label: string, query: string): boolean {
  if (!query) return true;
  const q = normalize(query);
  if (normalize(label).includes(q)) return true;
  if (entry.code.toLowerCase().includes(q)) return true;
  const locale = getLocale();
  if (locale === "zh-Hans") {
    if (languagePinyinInitials(entry.code).toLowerCase().includes(q)) return true;
  }
  if (locale === "zh-Hant") {
    const zhuyin = languageZhuyinInitials(entry.code);
    if (zhuyin && zhuyin.includes(query.trim())) return true;
  }
  return false;
}

export function mountLanguageSelect(options: MountOptions): { refresh: () => void; setValue: (code: string) => void } {
  const { select, container, entries, quickCodes, autoLabel, searchPlaceholder, ariaLabelledBy } = options;

  container.innerHTML = `
    <button type="button" class="lang-combo__trigger" aria-haspopup="listbox" aria-expanded="false"${ariaLabelledBy ? ` aria-labelledby="${ariaLabelledBy}"` : ""}>
      <span class="lang-combo__trigger-label"></span>
      ${CHEVRON_DOWN_ICON}
    </button>
    <div class="lang-combo__panel" hidden>
      <input type="text" class="lang-combo__search" placeholder="${searchPlaceholder || ""}" autocomplete="off" spellcheck="false" />
      <ul class="lang-combo__list" role="listbox"></ul>
    </div>
  `;
  container.classList.add("lang-combo");

  const trigger = container.querySelector<HTMLButtonElement>(".lang-combo__trigger")!;
  const triggerLabel = container.querySelector<HTMLElement>(".lang-combo__trigger-label")!;
  const panel = container.querySelector<HTMLElement>(".lang-combo__panel")!;
  const search = container.querySelector<HTMLInputElement>(".lang-combo__search")!;
  const list = container.querySelector<HTMLUListElement>(".lang-combo__list")!;

  function entryLabel(entry: LanguageSelectEntry): string {
    return entry.isAuto ? (autoLabel || "") : languageLabel(entry.code);
  }

  function currentLabel(): string {
    const match = entries.find((e) => e.code === select.value);
    return match ? entryLabel(match) : select.value;
  }

  function renderOption(e: LanguageSelectEntry): string {
    const active = e.code === select.value;
    return `<li role="option" class="lang-combo__option${active ? " lang-combo__option--active" : ""}" data-code="${e.code}" aria-selected="${active}">${entryLabel(e)}${e.isAuto ? "" : ` <span class="lang-combo__option-code">${e.code}</span>`}</li>`;
  }

  function sortedEntries(list: LanguageSelectEntry[] = entries): LanguageSelectEntry[] {
    const collator = new Intl.Collator(getLocale());
    return [...list].sort((a, b) => {
      if (a.isAuto) return -1;
      if (b.isAuto) return 1;
      return collator.compare(entryLabel(a), entryLabel(b));
    });
  }

  function renderList(query: string): void {
    if (!query) {
      const quickSet = new Set(quickCodes || []);
      const quickEntries = (quickCodes || []).map((code) => entries.find((e) => e.code === code)).filter((e): e is LanguageSelectEntry => !!e);
      const rest = entries.filter((e) => e.isAuto || !quickSet.has(e.code));
      const quickHtml = quickEntries.length
        ? `<li class="lang-combo__group-label">${t("languageSelect.quickPicks")}</li>${quickEntries.map(renderOption).join("")}
           <li class="lang-combo__group-label">${t("languageSelect.allLanguages")}</li>`
        : "";
      list.innerHTML = quickHtml + sortedEntries(rest).map(renderOption).join("");
      return;
    }
    const filtered = sortedEntries().filter((e) => matchesQuery(e, entryLabel(e), query));
    list.innerHTML = filtered.map(renderOption).join("") || `<li class="lang-combo__empty">—</li>`;
  }

  function openPanel(): void {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    search.value = "";
    renderList("");
    search.focus();
  }

  function closePanel(): void {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function selectCode(code: string): void {
    select.value = code;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    triggerLabel.textContent = currentLabel();
    closePanel();
    trigger.focus();
  }

  trigger.addEventListener("click", () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });

  search.addEventListener("input", () => renderList(search.value));

  list.addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>("[data-code]");
    if (item?.dataset.code) selectCode(item.dataset.code);
  });

  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePanel();
      trigger.focus();
    } else if (e.key === "Enter") {
      const first = list.querySelector<HTMLElement>("[data-code]");
      if (first?.dataset.code) selectCode(first.dataset.code);
    }
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target as Node)) closePanel();
  });

  triggerLabel.textContent = currentLabel();

  return {
    refresh: () => { triggerLabel.textContent = currentLabel(); },
    setValue: (code: string) => selectCode(code),
  };
}
