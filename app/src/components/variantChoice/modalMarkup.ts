import { t, th } from "../../i18n";
import { CLOSE_ICON } from "../../render/icons";
import { renderToggleRow } from "../../render/translator/settingFields";
import { fileNameInner } from "../../utils/fileNameMarkup";
import { escapeHtml } from "../../utils/escapeHtml";
import { labelAttrs } from "../../utils/labelAttrs";
import { renderScopeSwitcher } from "../scopeSwitcher";
import { activeGroup, canSelectPerFile, ChoiceState, fallbackGroupCount, groupKeysSorted, selectedKey } from "./choiceState";
import { languageTitle, renderFileRow, renderLanguageRow } from "./rowMarkup";

export const MODAL_TITLE_ID = "variant-modal-title";

function renderSubject(state: ChoiceState): string {
  if (state.groups.length === 1) return `<bdi data-truncatable data-filename>${fileNameInner(state.groups[0].relativePath)}</bdi>`;
  return th("task.fileCount", { count: state.groups.length });
}

function renderRows(state: ChoiceState): string {
  const checkedKey = selectedKey(state);
  if (state.perFile) {
    const group = activeGroup(state);
    return groupKeysSorted(state, group).map((key) => renderFileRow(group, key, key === checkedKey)).join("");
  }
  const multipleFiles = state.groups.length > 1;
  return state.rows.map((row, index) => renderLanguageRow(row, index, row.key === checkedKey, multipleFiles)).join("");
}

export function renderFallbackNote(state: ChoiceState): string {
  const count = fallbackGroupCount(state);
  if (!count) return "";
  const row = state.rows.find((candidate) => candidate.key === state.languageKey);
  return t("variant.fallbackNote", { count, language: languageTitle(row?.language ?? null) });
}

export function renderChoiceContent(state: ChoiceState): string {
  const group = activeGroup(state);
  const switcher = state.perFile
    ? `<div class="scope-switcher variant-modal__switcher" role="group" aria-label="${escapeHtml(t("variant.perFile.label"))}">${renderScopeSwitcher({ name: group.relativePath, index: state.activeIndex, total: state.groups.length })}</div>`
    : "";
  return `${switcher}<ul class="variant-modal__list" role="radiogroup" aria-labelledby="${MODAL_TITLE_ID}">${renderRows(state)}</ul><p class="muted muted--sm variant-modal__note" id="variant-note" role="status">${escapeHtml(renderFallbackNote(state))}</p>`;
}

export function renderChoiceModal(state: ChoiceState): string {
  const perFileToggle = canSelectPerFile(state) ? `<div class="variant-modal__mode">${renderToggleRow("variant-per-file", "variant.perFile.label", "variant.perFile.desc", state.perFile)}</div>` : "";
  return `
    <div class="modal variant-modal" role="dialog" aria-modal="true" aria-labelledby="${MODAL_TITLE_ID}">
      <div class="modal__head variant-modal__head">
        <div class="variant-modal__heading">
          <h2 id="${MODAL_TITLE_ID}" class="modal__title">${th("variant.title")}</h2>
          <p class="variant-modal__subject">${renderSubject(state)}</p>
        </div>
        <button type="button" class="icon-btn modal__close" ${labelAttrs(t("variant.close"))}>${CLOSE_ICON}</button>
      </div>
      <div class="modal__body modal__body--padded variant-modal__body">
        ${perFileToggle}
        <div class="variant-modal__content" id="variant-content">${renderChoiceContent(state)}</div>
      </div>
      <div class="variant-modal__foot">
        <button type="button" class="secondary" data-variant-cancel>${th("variant.cancel")}</button>
        <button type="button" class="primary" data-variant-confirm>${th("variant.confirm")}</button>
      </div>
    </div>`;
}
