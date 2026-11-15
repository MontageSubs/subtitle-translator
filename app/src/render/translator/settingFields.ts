import { TranslationKey, th } from "../../i18n";

export function renderToggleRow(id: string, labelKey: TranslationKey, descKey: TranslationKey, checked: boolean, name?: string, link?: { href: string; text: string }): string {
  return `
        <div class="toggle-row">
          <label class="toggle-row__text" for="${id}">
            <span class="toggle-row__label" id="${id}-label">${th(labelKey)}</span>
            <span class="toggle-row__desc" id="${id}-desc">${th(descKey)}${link ? ` <a href="${link.href}">${link.text}</a>` : ""}</span>
          </label>
          <span class="switch"><input type="checkbox" role="switch" id="${id}"${name ? ` name="${name}"` : ""} aria-labelledby="${id}-label" aria-describedby="${id}-desc"${checked ? " checked" : ""} /><span class="switch__track"></span></span>
        </div>`;
}

export function renderSegmentedField(id: string, labelKey: TranslationKey, noteKey: TranslationKey): string {
  return `
        <div class="field">
          <span id="${id}-label">${th(labelKey)}</span>
          <div class="segmented" id="${id}" role="radiogroup" aria-labelledby="${id}-label" aria-describedby="${id}-note"></div>
          <p class="field__desc" id="${id}-note">${th(noteKey)}</p>
        </div>`;
}

const ASS_SIZE_DIGITS = 3;

export function renderNumberField(id: string, labelKey: TranslationKey, value: number): string {
  return `
          <label class="field" for="${id}">
            <span>${th(labelKey)}</span>
            <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${ASS_SIZE_DIGITS}" autocomplete="off" id="${id}" value="${value}" />
          </label>`;
}
