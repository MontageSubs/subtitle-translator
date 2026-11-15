import { fileNameInner } from "../utils/fileNameMarkup";
import { getLocale, t } from "../i18n";
import { formatNumber } from "../utils/numberFormat";
import { CHEVRON_NEXT_ICON, CHEVRON_PREVIOUS_ICON } from "../render/icons";
import { labelAttrs } from "../utils/labelAttrs";

export interface ScopeSwitcherView {
  name: string;
  index: number;
  total: number;
}

export function renderScopeSwitcher({ name, index, total }: ScopeSwitcherView): string {
  return `<button type="button" class="scope-switcher__step" data-scope-step="-1" ${labelAttrs(t("terms.scope.previous"))}${index === 0 ? " disabled" : ""}>${CHEVRON_PREVIOUS_ICON}</button>
    <span class="scope-switcher__name" data-truncatable data-filename>${fileNameInner(name)}</span>
    <span class="scope-switcher__position">${formatNumber(index + 1, getLocale())}/${formatNumber(total, getLocale())}</span>
    <button type="button" class="scope-switcher__step" data-scope-step="1" ${labelAttrs(t("terms.scope.next"))}${index === total - 1 ? " disabled" : ""}>${CHEVRON_NEXT_ICON}</button>`;
}
