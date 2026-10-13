import { t, TranslationKey } from "../../i18n";

export function renderToggleRow(id: string, labelKey: TranslationKey, descKey: TranslationKey, checked: boolean, name?: string): string {
  return `
        <div class="toggle-row">
          <div class="toggle-row__text">
            <span class="toggle-row__label" id="${id}-label">${t(labelKey)}</span>
            <span class="toggle-row__desc" id="${id}-desc">${t(descKey)}</span>
          </div>
          <label class="switch"><input type="checkbox" role="switch" id="${id}"${name ? ` name="${name}"` : ""} aria-labelledby="${id}-label" aria-describedby="${id}-desc"${checked ? " checked" : ""} /><span class="switch__track"></span></label>
        </div>`;
}

export function renderSegmentedField(id: string, labelKey: TranslationKey, noteKey: TranslationKey): string {
  return `
        <div class="field">
          <span id="${id}-label">${t(labelKey)}</span>
          <div class="segmented" id="${id}" role="group" aria-labelledby="${id}-label" aria-describedby="${id}-note"></div>
          <p class="field__desc" id="${id}-note">${t(noteKey)}</p>
        </div>`;
}

export function renderNumberField(id: string, labelKey: TranslationKey, value: number): string {
  return `
          <label class="field" for="${id}">
            <span>${t(labelKey)}</span>
            <input type="number" id="${id}" min="8" max="200" value="${value}" />
          </label>`;
}
