import { t } from "../i18n";
import { escapeHtml } from "../utils/escapeHtml";

export interface LanguageEntry {
  code: string;
  label?: string;
  onSelect?: () => void;
}

export interface LanguageListModel {
  listId: string;
  activeCode: string;
  all: LanguageEntry[];
  featured: LanguageEntry[];
  featuredLabel: string;
  labelOf(entry: LanguageEntry): string;
}

type OptionGroup = "featured" | "all";

function renderOption(model: LanguageListModel, entry: LanguageEntry, group: OptionGroup): string {
  const active = entry.code === model.activeCode;
  const code = entry.label ? "" : ` <span class="lang-combo__option-code">${entry.code}</span>`;
  return `<li role="option" id="${model.listId}-${group}-${entry.code}" class="lang-combo__option${active ? " lang-combo__option--active" : ""}" data-code="${entry.code}" aria-selected="${active}">${escapeHtml(model.labelOf(entry))}${code}</li>`;
}

function renderGroup(model: LanguageListModel, label: string, group: OptionGroup, entries: LanguageEntry[]): string {
  return `<li class="lang-combo__group-label" role="presentation">${label}</li>${entries.map((entry) => renderOption(model, entry, group)).join("")}`;
}

export function renderLanguageList(model: LanguageListModel): string {
  const markup = model.featured.length
    ? renderGroup(model, model.featuredLabel, "featured", model.featured) + renderGroup(model, t("languageSelect.allLanguages"), "all", model.all)
    : model.all.map((entry) => renderOption(model, entry, "all")).join("");
  return markup || `<li class="lang-combo__empty" role="presentation">${t("languageSelect.noResults")}</li>`;
}
