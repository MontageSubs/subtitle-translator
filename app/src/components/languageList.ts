import { t } from "../i18n";
import { escapeHtml } from "../utils/escapeHtml";
import { labelAttrs } from "../utils/labelAttrs";
import { CLOSE_ICON } from "../render/icons";

export interface LanguageEntry {
  code: string;
  label?: string;
  title?: string;
  selected?: boolean;
  onSelect?: () => void;
}

export interface LanguageListModel {
  listId: string;
  activeCode: string;
  disabledCode?: string;
  all: LanguageEntry[];
  recent: LanguageEntry[];
  featured: LanguageEntry[];
  featuredLabel: string;
  recentLabel: string;
  labelOf(entry: LanguageEntry): string;
  codeOf(entry: LanguageEntry): string;
}

type OptionGroup = "recent" | "featured" | "all";

function renderForgetButton(model: LanguageListModel, entry: LanguageEntry): string {
  const label = t("languageSelect.forget", { language: model.labelOf(entry) });
  return `<button type="button" class="lang-combo__forget" tabindex="-1" data-forget="${entry.code}" ${labelAttrs(label)}>${CLOSE_ICON}</button>`;
}

function renderOption(model: LanguageListModel, entry: LanguageEntry, group: OptionGroup): string {
  const active = entry.selected ?? entry.code === model.activeCode;
  const code = entry.label ? "" : ` <span class="lang-combo__option-code">${entry.code}</span>`;
  const forget = group === "recent" ? renderForgetButton(model, entry) : "";
  const memory = group === "recent" ? " data-memory" : "";
  const disabled = entry.code === model.disabledCode;
  const titleText = disabled ? t("languageSelect.sameLanguage") : entry.title;
  const title = titleText ? ` title="${escapeHtml(titleText)}"` : "";
  const disabledAttrs = disabled ? ' aria-disabled="true"' : "";
  return `<li role="option" id="${model.listId}-${group}-${entry.code}" class="lang-combo__option${active ? " lang-combo__option--active" : ""}${disabled ? " lang-combo__option--disabled" : ""}" data-code="${entry.code}"${memory}${title}${disabledAttrs} aria-selected="${active}">${escapeHtml(model.labelOf(entry))}${code}${forget}</li>`;
}

function renderGroup(model: LanguageListModel, label: string, group: OptionGroup, entries: LanguageEntry[]): string {
  return entries.length ? `<li class="lang-combo__group-label" role="presentation">${label}</li>${entries.map((entry) => renderOption(model, entry, group)).join("")}` : "";
}

export function renderLanguageList(model: LanguageListModel): string {
  const pinned = renderGroup(model, model.recentLabel, "recent", model.recent) + renderGroup(model, model.featuredLabel, "featured", model.featured);
  const markup = pinned
    ? pinned + renderGroup(model, t("languageSelect.allLanguages"), "all", model.all)
    : model.all.map((entry) => renderOption(model, entry, "all")).join("");
  return markup || `<li class="lang-combo__empty" role="presentation">${t("languageSelect.noResults")}</li>`;
}
