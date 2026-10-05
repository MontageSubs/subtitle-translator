import { t, LocaleCode } from "../../i18n";
import { buildPath } from "../../router/router";
import { renderDirectionArrow, renderCheckIcon, renderWarningIcon, renderRetryIcon, renderStopIcon, EYE_ICON, FILE_ICON, PENCIL_ICON, DOWNLOAD_TRAY_ICON, CHEVRON_DOWN_SMALL_ICON } from "../icons";

export interface ActionConsoleInput {
  locale: LocaleCode;
  visible: boolean;
  headerLabel: string;
}

function renderConsentNote(locale: LocaleCode): string {
  const termsLink = `<a href="${buildPath(locale, "docs", ["terms"])}" target="_blank" rel="noopener">${t("start.terms")}</a>`;
  const privacyLink = `<a href="${buildPath(locale, "docs", ["privacy"])}" target="_blank" rel="noopener">${t("start.privacy")}</a>`;
  return t("start.consent", { terms: termsLink, privacy: privacyLink });
}

function renderTaskHeader(headerLabel: string): string {
  return `
        <div class="task-card__header">
          <div class="task-card__meta">
            <div class="task-card__file">
              ${FILE_ICON}
              <span id="task-filename" class="task-card__filename">${headerLabel}</span>
            </div>
            <div class="task-card__submeta">
              <span id="task-cue-count" class="task-card__badge"></span>
              <button type="button" class="task-card__config-pill" id="task-config-pill">
                <span id="task-direction" class="task-card__direction"></span>
                <span id="task-config-tags" class="task-card__tags"></span>
                ${PENCIL_ICON}
              </button>
            </div>
          </div>
          <div class="task-card__status-badge task-card__status-badge--ready" id="task-status-badge">
            <span class="status-dot"></span>
            <span id="task-status-text">${t("task.status.ready")}</span>
          </div>
        </div>`;
}

function renderReadyView(locale: LocaleCode): string {
  return `
        <div class="task-view task-view--ready" id="task-view-ready">
          <div class="task-ready-actions">
            <button type="button" id="start" class="primary task-start-btn">
              <span>${t("start.button")}</span>
              ${renderDirectionArrow(16, "")}
            </button>
          </div>
          <p class="task-legal-note" id="task-legal-note">${renderConsentNote(locale)}</p>
        </div>`;
}

function renderProcessingView(): string {
  return `
        <div class="task-view task-view--processing" id="task-view-processing" hidden>
          <div class="task-progress-head">
            <span class="task-processing-label" id="progress-label"></span>
            <span id="task-elapsed-timer" class="task-timer">0.0s</span>
          </div>
          <div class="task-progress-container" role="progressbar" aria-valuemin="0" aria-valuemax="100">
            <div class="task-progress-fill task-progress-fill--indeterminate" id="task-progress-fill"></div>
          </div>
          <div class="task-processing-footer">
            <span id="progress-count" class="task-processing-detail"></span>
            <button type="button" id="task-stop-btn" class="action-pill action-pill--danger">
              ${renderStopIcon()}
              <span id="task-stop-label">${t("task.stop")}</span>
            </button>
          </div>
        </div>`;
}

function renderFormatOption(format: string, label: string): string {
  return `
                  <button type="button" class="task-format-option" data-format="${format}">
                    <span>${label}</span>
                    <span class="task-format-badge">.${format}</span>
                  </button>`;
}

function renderMetric(valueId: string, labelId: string | null, valueText: string, labelText: string): string {
  const labelAttr = labelId ? ` id="${labelId}"` : "";
  return `
            <div class="task-metric">
              <span class="task-metric__value" id="${valueId}">${valueText}</span>
              <span class="task-metric__label"${labelAttr}>${labelText}</span>
            </div>`;
}

function renderCompletedView(): string {
  return `
        <div class="task-view task-view--completed" id="task-view-completed" hidden>
          <div class="task-metrics-grid" id="task-metrics-grid">
            <div class="task-metric task-metric--status" id="metric-status-wrap">
              <span class="task-metric__value task-metric__value--status" id="metric-status">
                ${renderCheckIcon()}
                <span>${t("task.status.done")}</span>
              </span>
              <span class="task-metric__label" id="metric-status-lbl">${t("field.status")}</span>
            </div>${renderMetric("metric-cues", "metric-cues-lbl", "0", t("field.cues"))}${renderMetric("metric-elapsed", null, "0.0s", t("task.metrics.elapsed"))}
          </div>

          <div class="task-file-list" id="task-file-list" hidden></div>

          <div class="task-delivery-actions">
            <div class="task-download-group">
              <a id="download-link" class="primary primary--download" download>
                ${DOWNLOAD_TRAY_ICON}
                <span id="download-button-label">${t("download.button")}</span>
              </a>
              <details class="task-format-menu" id="task-format-menu">
                <summary class="task-format-trigger" title="${t("field.outputMode")}">
                  ${CHEVRON_DOWN_SMALL_ICON}
                </summary>
                <div class="task-format-popover">${renderFormatOption("srt", "SRT")}${renderFormatOption("vtt", "WebVTT")}${renderFormatOption("ass", "ASS")}
                </div>
              </details>
            </div>

            <button type="button" id="preview-button" class="secondary">
              ${EYE_ICON}
              <span>${t("preview.button")}</span>
            </button>

            <button type="button" id="retranslate-button" class="action-pill">
              ${renderRetryIcon()}
              <span id="retranslate-label">${t("task.retranslate")}</span>
            </button>
          </div>
        </div>`;
}

function renderFailedView(): string {
  return `
        <div class="task-view task-view--failed" id="task-view-failed" hidden>
          <div class="task-metrics-grid">
            <div class="task-metric task-metric--failed">
              <span class="task-metric__value task-metric__value--failed">
                ${renderWarningIcon()}
                <span>${t("task.failed.title")}</span>
              </span>
              <span class="task-metric__label">${t("field.status")}</span>
            </div>${renderMetric("task-failed-cues", null, "0 / 0", t("field.completed"))}${renderMetric("task-failed-elapsed", null, "0.0s", t("task.metrics.elapsed"))}
          </div>

          <div class="task-failed-banner">
            <span class="task-failed-desc" id="task-error-text" role="alert"></span>
          </div>

          <div class="task-failed-actions">
            <button type="button" id="task-retry-btn" class="primary task-btn">
              ${renderRetryIcon(16)}
              <span>${t("task.retry")}</span>
            </button>
            <button type="button" id="task-cancel-btn" class="secondary task-btn">
              <span>${t("task.cancel")}</span>
            </button>
          </div>
        </div>`;
}

function renderLogDisclosure(): string {
  return `
      <div class="task-disclosures">
        <details class="task-disclosure" id="log-details" hidden>
          <summary class="task-disclosure__summary" id="log-summary">
            <span id="log-summary-text">${t("log.expand")}</span>
          </summary>
          <div class="task-disclosure__content">
            <pre class="log" id="log"></pre>
          </div>
        </details>
      </div>`;
}

export function renderActionConsole(input: ActionConsoleInput): string {
  return `
    <section class="step" id="action-console" ${input.visible ? "" : "hidden"}>
      <div class="step__head"><span class="step__num">3</span><span class="step__title">${t("step.action.title")}</span></div>

      <div class="task-card" id="task-card">${renderTaskHeader(input.headerLabel)}${renderReadyView(input.locale)}${renderProcessingView()}${renderCompletedView()}${renderFailedView()}
      </div>${renderLogDisclosure()}
    </section>`;
}
