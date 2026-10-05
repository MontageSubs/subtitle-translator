import { t } from "../../i18n";
import { CLOSE_ICON, DOWNLOAD_ICON, TRASH_ICON, UPLOAD_ICON } from "../../render/icons";

function renderActionPill(id: string, labelKey: "history.import" | "history.export" | "history.clearAll", icon: string, variant = "", labelId = ""): string {
  const label = t(labelKey);
  const labelAttribute = labelId ? ` id="${labelId}"` : "";
  return `<button type="button" class="action-pill${variant}" id="${id}" title="${label}" aria-label="${label}">
            ${icon} <span${labelAttribute}>${label}</span>
          </button>`;
}

export function renderHistoryPage(): string {
  const searchLabel = t("history.searchPlaceholder");
  return `
    <section class="step">
      <div class="history-page-header">
        <h1 class="history-page-title">${t("nav.history")}</h1>
        <div class="history-action-group">
          <input type="file" id="history-import-input" accept=".json" hidden />
          ${renderActionPill("history-import-btn", "history.import", UPLOAD_ICON)}
          ${renderActionPill("history-export-btn", "history.export", DOWNLOAD_ICON)}
          ${renderActionPill("history-clear", "history.clearAll", TRASH_ICON, " action-pill--danger", "history-clear-label")}
        </div>
      </div>
      <p class="history-page-subtitle">${t("history.offlineNotice")}</p>
      <div class="history-search-wrap">
        <input type="search" id="history-search-input" class="history-search-input" role="searchbox" placeholder="${searchLabel}" aria-label="${searchLabel}" />
        <button type="button" class="preview-search-clear icon-btn" id="history-search-clear" aria-label="${t("preview.clearSearch")}" hidden>${CLOSE_ICON}</button>
      </div>
      <p class="search-match-count" id="history-match-count" aria-live="polite"></p>
      <div class="history-list" id="history-list"></div>
    </section>
  `;
}
