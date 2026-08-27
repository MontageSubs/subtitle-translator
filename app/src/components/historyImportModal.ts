import { listHistoryJobs, HistoryJob } from '../lib/history/history';
import { t } from "../i18n";
import { CLOSE_ICON, CHEVRON_DOWN_ICON, UPLOAD_ICON } from "../render/icons";
import { formatDateTime } from '../utils/formatDate';
import { Glossary } from '../utils/types';

export type ImportType = "context" | "glossary";

export interface HistoryImportResult {
  contextText?: string;
  glossary?: Glossary;
  caseSensitiveTerms?: boolean;
}

export function openHistoryImportModal(
  type: ImportType,
  onSelect: (result: HistoryImportResult) => void
): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";

  const modalTitle = type === "context"
    ? t("history.importContextTitle")
    : t("history.importGlossaryTitle");

  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="history-import-title" style="max-width: 680px; max-height: 85vh;">
      <div class="modal__head">
        <h2 id="history-import-title" class="step__title" style="margin: 0; font-size: 1.05rem;">
          ${modalTitle}
        </h2>
        <button type="button" class="icon-btn modal__close" aria-label="${t("preview.close")}">${CLOSE_ICON}</button>
      </div>
      <div class="modal__body" style="padding: 16px; flex-direction: column; overflow: hidden;">
        <div style="margin-bottom: 12px; flex-shrink: 0;">
          <input type="search" class="preview-search" id="history-import-search" placeholder="${t("history.searchJobs")}" aria-label="${t("history.searchJobs")}" />
        </div>
        <div id="history-import-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-bottom: 4px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.body.style.overflow = "hidden";

  const listEl = backdrop.querySelector<HTMLElement>("#history-import-list")!;
  const searchInput = backdrop.querySelector<HTMLInputElement>("#history-import-search")!;

  function close(): void {
    document.body.style.overflow = "";
    backdrop.remove();
  }

  backdrop.querySelector(".modal__close")?.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  backdrop.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  listHistoryJobs().then((allJobs) => {
    const validJobs = allJobs.filter((job) => {
      if (type === "context") return Boolean(job.contextText?.trim());
      if (type === "glossary") return Boolean(job.glossary && Object.keys(job.glossary).length > 0);
      return false;
    });

    const expandedState = new Set<string>();

    function renderList(filterText = ""): void {
      const query = filterText.toLowerCase().trim();
      const filtered = validJobs.filter((job) => {
        if (!query) return true;
        const inTitle = job.title.toLowerCase().includes(query);
        const inLang = `${job.sourceLang} ${job.targetLang}`.toLowerCase().includes(query);
        if (type === "context") {
          return inTitle || inLang || (job.contextText || "").toLowerCase().includes(query);
        } else {
          const glossaryStr = job.glossary ? JSON.stringify(job.glossary).toLowerCase() : "";
          return inTitle || inLang || glossaryStr.includes(query);
        }
      });

      if (!filtered.length) {
        listEl.innerHTML = `<p class="muted" style="text-align:center; padding: 32px 0;">${t("history.noMatchingJobs")}</p>`;
        return;
      }

      listEl.innerHTML = filtered.map((job) => {
        const isExpanded = expandedState.has(job.id);
        let previewContent = "";
        let metaCountText = "";

        if (type === "context" && job.contextText) {
          const charCount = job.contextText.length;
          metaCountText = `${charCount} chars`;
          previewContent = `
            <div class="history-job-card__preview-box">${escapeHtml(job.contextText)}</div>
            <div class="history-job-card__footer">
              <span class="muted" style="font-size: 0.8rem;">${charCount} chars</span>
              <button type="button" class="action-pill" data-import-id="${job.id}" style="color: var(--accent); font-weight: 600;">
                ${UPLOAD_ICON} <span>${t("history.importThisContext")}</span>
              </button>
            </div>
          `;
        } else if (type === "glossary" && job.glossary) {
          const entries = Object.entries(job.glossary);
          metaCountText = t("history.termsCount", { count: entries.length });
          const tagsHtml = entries.map(([src, tgt]) => `
            <div class="history-job-card__glossary-tag">
              <span class="src">${escapeHtml(src)}</span>
              <span class="arrow">→</span>
              <span class="tgt">${escapeHtml(tgt)}</span>
            </div>
          `).join("");

          previewContent = `
            <div class="history-job-card__glossary-grid">${tagsHtml}</div>
            <div class="history-job-card__footer">
              <span class="muted" style="font-size: 0.8rem;">${metaCountText}</span>
              <button type="button" class="action-pill" data-import-id="${job.id}" style="color: var(--accent); font-weight: 600;">
                ${UPLOAD_ICON} <span>${t("history.importThisGlossary")}</span>
              </button>
            </div>
          `;
        }

        return `
          <div class="history-job-card ${isExpanded ? "history-job-card--expanded" : ""}" data-card-id="${job.id}">
            <div class="history-job-card__head" data-toggle-id="${job.id}" role="button" tabindex="0" aria-expanded="${isExpanded}">
              <div>
                <div class="history-job-card__title">
                  <span class="history-row__engine">${job.engine.toUpperCase()}</span>
                  <span>${escapeHtml(job.title)}</span>
                </div>
                <div class="history-job-card__meta">
                  ${escapeHtml(job.sourceLang)} → ${escapeHtml(job.targetLang)} · ${metaCountText} · ${formatDateTime(job.updatedAt)}
                </div>
              </div>
              <div class="history-job-card__expand-icon">${CHEVRON_DOWN_ICON}</div>
            </div>
            ${isExpanded ? `<div class="history-job-card__body">${previewContent}</div>` : ""}
          </div>
        `;
      }).join("");

      listEl.querySelectorAll<HTMLElement>("[data-toggle-id]").forEach((head) => {
        const id = head.dataset.toggleId!;
        const toggle = () => {
          if (expandedState.has(id)) {
            expandedState.delete(id);
          } else {
            expandedState.add(id);
          }
          renderList(searchInput.value);
        };
        head.addEventListener("click", toggle);
        head.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        });
      });

      listEl.querySelectorAll<HTMLButtonElement>("[data-import-id]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const jobId = btn.dataset.importId;
          const job = filtered.find((j) => j.id === jobId);
          if (!job) return;

          if (type === "context") {
            onSelect({ contextText: job.contextText });
          } else {
            onSelect({ glossary: job.glossary, caseSensitiveTerms: job.caseSensitiveTerms });
          }
          close();
        });
      });
    }

    searchInput.addEventListener("input", () => renderList(searchInput.value));
    renderList();
    searchInput.focus();
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
