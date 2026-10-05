import { t } from "../../../i18n";
import { CLOSE_ICON } from "../../../render/icons";
import { renderContextInput } from "../../contextInput";
import { MAXIMIZE_ICON, NEXT_ICON, PREVIOUS_ICON, REDO_ICON, UNDO_ICON } from "./icons";

export type PreviewTab = "cards" | "context" | "glossary" | "raw-source" | "raw-target" | "compare";

export interface PreviewMarkupInput {
  reportHref: string;
  sourceLabel: string;
  targetLabel: string;
  lastUpdatedLabel: string;
  filterOnly: boolean;
}

const TABS: { id: PreviewTab; labelKey: "preview.tabEditor" | "preview.tabContext" | "preview.tabGlossary" | "preview.tabRawSource" | "preview.tabRawTarget" | "preview.tabCompare" }[] = [
  { id: "cards", labelKey: "preview.tabEditor" },
  { id: "context", labelKey: "preview.tabContext" },
  { id: "glossary", labelKey: "preview.tabGlossary" },
  { id: "raw-source", labelKey: "preview.tabRawSource" },
  { id: "raw-target", labelKey: "preview.tabRawTarget" },
  { id: "compare", labelKey: "preview.tabCompare" },
];

function renderTabs(): string {
  return TABS.map(({ id, labelKey }, index) => {
    const label = t(labelKey);
    const active = index === 0;
    return `<button type="button" class="modal__tab${active ? " modal__tab--active" : ""}" role="tab" aria-selected="${active}" data-tab="${id}" title="${label}">${label}</button>`;
  }).join("\n          ");
}

function renderReportLink(href: string): string {
  return `<a class="text-link preview-report-link" href="${href}" target="_blank" rel="noopener">${t("preview.reportIssue")}</a>`;
}

function renderFooter(href: string, action: string): string {
  return `<div class="preview-footer">
            ${renderReportLink(href)}
            ${action}
          </div>`;
}

function renderApplyButton(id: string): string {
  return `<button type="button" class="primary preview-apply-btn" id="${id}" disabled>${t("preview.apply")}</button>`;
}

function renderDownloadButton(target: "source" | "target"): string {
  return `<button type="button" class="primary preview-download-btn" data-target="${target}">${t("preview.download")}</button>`;
}

function renderIconButton(id: string, labelKey: "preview.prevMatch" | "preview.nextMatch" | "preview.undo" | "preview.redo", icon: string): string {
  const label = t(labelKey);
  return `<button type="button" class="preview-icon-button" id="${id}" title="${label}" aria-label="${label}" disabled>${icon}</button>`;
}

function renderContextTab(href: string): string {
  return `<div class="preview-context-container" id="preview-context-container" hidden>
          <div class="preview-tab-body">
            <div class="field field--context">
              <div class="field__header">
                <label for="preview-context-input">${t("context.label")}</label>
                <button type="button" class="action-pill" id="preview-context-history-import">${t("history.import")}</button>
              </div>
              ${renderContextInput("preview-context-input", "preview-context-clear", 5)}
              <span class="field__counter field__counter--block" id="preview-context-counter"></span>
            </div>
          </div>
          ${renderFooter(href, renderApplyButton("preview-context-apply"))}
        </div>`;
}

function renderGlossaryTab(href: string): string {
  return `<div class="preview-glossary-container" id="preview-glossary-container" hidden>
          <div class="preview-tab-body">
            <div id="preview-glossary-editor"></div>
          </div>
          ${renderFooter(href, renderApplyButton("preview-glossary-apply"))}
        </div>`;
}

function renderRawTab(name: "source" | "target", href: string): string {
  return `<div class="preview-raw-container" id="preview-raw-${name}-container" hidden>
          <pre class="preview-raw" id="preview-raw-${name}"></pre>
          ${renderFooter(href, renderDownloadButton(name))}
        </div>`;
}

function renderCompareTab(input: PreviewMarkupInput): string {
  return `<div class="preview-compare-container" id="preview-compare-container" hidden>
          <div class="preview-compare-panes">
            <div class="preview-compare-pane"><pre class="preview-raw preview-compare-raw" id="preview-compare-source" dir="auto"></pre></div>
            <div class="preview-compare-pane"><pre class="preview-raw preview-compare-raw" id="preview-compare-target" dir="auto"></pre></div>
          </div>
          <div class="preview-footer preview-compare-footer">
            <div class="preview-compare-footer-col"><span>${input.sourceLabel}</span></div>
            <div class="preview-compare-footer-col"><span>${input.targetLabel}</span></div>
          </div>
        </div>`;
}

function renderToolbar(filterOnly: boolean): string {
  return `<div class="preview-toolbar">
            <div class="preview-search-wrap">
              <input type="search" class="preview-search" id="preview-search-input" placeholder="${t("preview.searchPlaceholder")}" aria-label="${t("preview.searchPlaceholder")}" />
              <button type="button" class="preview-search-clear icon-btn" id="preview-search-clear" aria-label="${t("preview.clearSearch")}" hidden>${CLOSE_ICON}</button>
            </div>
            <div class="preview-search-actions">
              <span class="preview-match-count" id="preview-match-count" aria-live="polite"></span>
              <label class="preview-filter-label" for="preview-filter-checkbox" title="${t("preview.searchModeFilter")}">
                <input type="checkbox" id="preview-filter-checkbox" name="preview_filter_checkbox" class="preview-filter-checkbox"${filterOnly ? " checked" : ""} />
                <span>${t("preview.searchModeFilter")}</span>
              </label>
              ${renderIconButton("preview-prev-match", "preview.prevMatch", PREVIOUS_ICON)}
              ${renderIconButton("preview-next-match", "preview.nextMatch", NEXT_ICON)}
              ${renderIconButton("preview-undo", "preview.undo", UNDO_ICON)}
              ${renderIconButton("preview-redo", "preview.redo", REDO_ICON)}
              <button type="button" class="text-link" id="preview-toggle-replace">${t("preview.findReplace")}</button>
            </div>
          </div>
          <div class="preview-replace-bar" id="preview-replace-bar" hidden>
            <input type="text" class="preview-search" id="preview-replace-input" placeholder="${t("preview.replacePlaceholder")}" aria-label="${t("preview.replacePlaceholder")}" />
            <button type="button" class="secondary" id="preview-replace-one">${t("preview.replaceSingle")}</button>
            <button type="button" class="primary" id="preview-replace-all">${t("preview.replaceAll")}</button>
          </div>`;
}

function renderCardsTab(input: PreviewMarkupInput): string {
  return `<div class="preview-cards-pane" id="preview-cards-container">
          ${renderToolbar(input.filterOnly)}
          <div class="preview-error-area" id="preview-error-area" hidden>
            <div class="preview-error-category-buttons" id="preview-error-buttons" role="group" aria-label="${t("preview.errorCategories")}"></div>
            <div class="preview-error-cue-numbers" id="preview-error-cues" hidden></div>
          </div>
          <div class="preview-cards-container">
            <div class="preview-cards-host" tabindex="-1"></div>
            <div class="preview-minimap" id="preview-minimap" hidden aria-hidden="true"></div>
          </div>
          <div class="preview-footer">
            ${renderReportLink(input.reportHref)}
            <span class="preview-updated-label" id="preview-updated-label" aria-live="polite">${input.lastUpdatedLabel}</span>
            <button type="button" class="primary" id="preview-apply" disabled>${t("preview.apply")}</button>
          </div>
        </div>`;
}

export function renderPreviewModal(input: PreviewMarkupInput): string {
  return `
    <div class="modal preview-modal-box" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
      <h2 id="preview-modal-title" class="sr-only">${t("preview.button")}</h2>
      <div class="modal__head">
        <div class="modal__tabs" role="tablist">
          ${renderTabs()}
        </div>
        <div class="modal__controls">
          <button type="button" class="icon-btn modal__maximize" aria-label="Maximize">${MAXIMIZE_ICON}</button>
          <button type="button" class="icon-btn modal__close" aria-label="${t("preview.close")}">${CLOSE_ICON}</button>
        </div>
      </div>
      <div class="modal__body">
        ${renderContextTab(input.reportHref)}
        ${renderGlossaryTab(input.reportHref)}
        ${renderRawTab("source", input.reportHref)}
        ${renderRawTab("target", input.reportHref)}
        ${renderCompareTab(input)}
        ${renderCardsTab(input)}
      </div>
    </div>
  `;
}
