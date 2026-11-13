import { t, th } from "../i18n";
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

export type LanguageGroup = "recent" | "featured" | "all";

export interface LanguageListModel {
  listId: string;
  activeCodes: ReadonlySet<string>;
  featuredFirst: boolean;
  disabledCode?: string;
  all: LanguageEntry[];
  recent: LanguageEntry[];
  featured: LanguageEntry[];
  featuredLabel: string;
  recentLabel: string;
  labelOf(entry: LanguageEntry): string;
  codeOf(entry: LanguageEntry): string;
}

function renderForgetButton(model: LanguageListModel, entry: LanguageEntry): string {
  const label = t("languageSelect.forget", { language: model.labelOf(entry) });
  return `<button type="button" class="lang-combo__forget" tabindex="-1" data-forget="${entry.code}" ${labelAttrs(label)}>${CLOSE_ICON}</button>`;
}

function renderOption(model: LanguageListModel, entry: LanguageEntry, group: LanguageGroup): string {
  const active = entry.selected ?? model.activeCodes.has(entry.code);
  const code = entry.label ? "" : ` <span class="lang-combo__option-code">${entry.code}</span>`;
  const forget = group === "recent" ? renderForgetButton(model, entry) : "";
  const memory = group === "recent" ? " data-memory" : "";
  const disabled = entry.code === model.disabledCode;
  const titleText = disabled ? t("languageSelect.sameLanguage") : entry.title;
  const title = titleText ? ` title="${escapeHtml(titleText)}"` : "";
  const disabledAttrs = disabled ? ' aria-disabled="true"' : "";
  return `<li role="option" id="${model.listId}-${group}-${entry.code}" class="lang-combo__option${active ? " lang-combo__option--active" : ""}${disabled ? " lang-combo__option--disabled" : ""}" data-code="${entry.code}" data-group="${group}"${memory}${title}${disabledAttrs} aria-selected="${active}">${escapeHtml(model.labelOf(entry))}${code}${forget}</li>`;
}

function renderGroup(model: LanguageListModel, label: string, group: LanguageGroup, entries: LanguageEntry[]): string {
  return entries.length ? `<li class="lang-combo__group-label" role="presentation">${label}</li>${entries.map((entry) => renderOption(model, entry, group)).join("")}` : "";
}

export function renderLanguageList(model: LanguageListModel): string {
  const recent = renderGroup(model, model.recentLabel, "recent", model.recent);
  const featured = renderGroup(model, model.featuredLabel, "featured", model.featured);
  const pinned = model.featuredFirst ? featured + recent : recent + featured;
  const markup = pinned
    ? pinned + renderGroup(model, t("languageSelect.allLanguages"), "all", model.all)
    : model.all.map((entry) => renderOption(model, entry, "all")).join("");
  return markup || `<li class="lang-combo__empty" role="presentation">${th("languageSelect.noResults")}</li>`;
}
