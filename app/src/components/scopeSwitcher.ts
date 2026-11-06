import { t } from "../i18n";
import { CHEVRON_NEXT_ICON, CHEVRON_PREVIOUS_ICON } from "../render/icons";
import { escapeHtml } from "../utils/escapeHtml";
import { labelAttrs } from "../utils/labelAttrs";

export interface ScopeSwitcherView {
  name: string;
  index: number;
  total: number;
}

export function renderScopeSwitcher({ name, index, total }: ScopeSwitcherView): string {
  return `<button type="button" class="scope-switcher__step" data-scope-step="-1" ${labelAttrs(t("terms.scope.previous"))}${index === 0 ? " disabled" : ""}>${CHEVRON_PREVIOUS_ICON}</button>
    <span class="scope-switcher__name" title="${escapeHtml(name)}"><bdi>${escapeHtml(name)}</bdi></span>
    <span class="scope-switcher__position">${index + 1}/${total}</span>
    <button type="button" class="scope-switcher__step" data-scope-step="1" ${labelAttrs(t("terms.scope.next"))}${index === total - 1 ? " disabled" : ""}>${CHEVRON_NEXT_ICON}</button>`;
}
