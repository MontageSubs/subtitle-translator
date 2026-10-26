import { t, getLocale, LocaleCode, TranslationKey } from "../../i18n";
import { tipAttr } from "../../utils/labelAttrs";
import { buildPath } from "../../router/router";
import { renderExternalLinkIcon, renderDirectionArrow, renderCheckIcon, renderWarningIcon, renderRetryIcon, renderResumeIcon, renderStopIcon, EYE_ICON, FILE_ICON, PENCIL_ICON, DOWNLOAD_TRAY_ICON, CHEVRON_DOWN_SMALL_ICON } from "../icons";

export interface ActionConsoleInput {
  locale: LocaleCode;
  visible: boolean;
  headerLabel: string;
}

function renderConsentNote(locale: LocaleCode): string {
  const termsLink = `<a href="${buildPath(locale, "docs", ["terms"])}" target="_blank" rel="noopener">${t("start.terms")}${renderExternalLinkIcon(t("a11y.opensInNewTab"))}</a>`;
  const privacyLink = `<a href="${buildPath(locale, "docs", ["privacy"])}" target="_blank" rel="noopener">${t("start.privacy")}${renderExternalLinkIcon(t("a11y.opensInNewTab"))}</a>`;
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
              <button type="button" class="task-card__config-pill" id="task-config-pill" ${tipAttr(t("tip.configPill"))}>
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
          <div class="task-progress-container" role="progressbar" aria-labelledby="progress-label" aria-valuemin="0" aria-valuemax="100">
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

function renderFormatOption(format: string, label: string, tipKey: TranslationKey): string {
  return `
                  <button type="button" class="task-format-option" data-format="${format}" ${tipAttr(t(tipKey))}>
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

const DOWNLOAD_FORMAT_LABELS = ["SRT", "WebVTT", "ASS", "ZIP"];

function renderDownloadLabel(): string {
  const sizers = DOWNLOAD_FORMAT_LABELS.map((format) => `<span class="task-download-label__sizer" aria-hidden="true">${t("download.button")} (${format}) *</span>`).join("");
  return `<span class="task-download-label"><span id="download-button-label">${t("download.button")}</span>${sizers}</span>`;
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

          <div class="task-failed-banner" id="task-partial-banner" hidden>
            <span class="task-failed-desc" role="alert"><span id="task-partial-text"></span>${renderFeedbackLink("task-partial-help")}</span>
          </div>

          <div class="task-file-list" id="task-file-list" hidden></div>

          <div class="task-delivery-actions">
            <div class="task-download-group">
              <a id="download-link" class="primary primary--download" download>
                ${DOWNLOAD_TRAY_ICON}
                ${renderDownloadLabel()}
              </a>
              <details class="task-format-menu" id="task-format-menu">
                <summary class="task-format-trigger" title="${t("download.format")}" aria-label="${t("download.format")}">
                  ${CHEVRON_DOWN_SMALL_ICON}
                </summary>
                <div class="task-format-popover">${renderFormatOption("srt", "SRT", "tip.formatSrt")}${renderFormatOption("vtt", "WebVTT", "tip.formatVtt")}${renderFormatOption("ass", "ASS", "tip.formatAss")}
                </div>
              </details>
            </div>

            <button type="button" id="preview-button" class="secondary" ${tipAttr(t("tip.preview"))}>
              ${EYE_ICON}
              <span>${t("preview.button")}</span>
            </button>

            <button type="button" id="task-resume-btn" class="secondary" hidden>
              ${renderResumeIcon()}
              <span id="task-resume-label"></span>
            </button>

            <button type="button" id="retranslate-button" class="secondary" ${tipAttr(t("tip.retranslate"))}>
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
            <span class="task-failed-desc" role="alert"><span id="task-error-text"></span>${renderFeedbackLink("task-error-help")}</span>
          </div>

          <div class="task-failed-actions">
            <button type="button" id="task-retry-btn" class="primary task-btn">
              ${renderRetryIcon(16)}
              <span>${t("task.retry")}</span>
            </button>
            <button type="button" id="task-cancel-btn" ${tipAttr(t("tip.dismissError"))} class="secondary task-btn">
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

const renderFeedbackLink = (id: string): string =>
  ` <a id="${id}" href="${buildPath(getLocale(), "docs", ["feedback"])}" target="_blank" rel="noopener" hidden>${t("error.workerLimit.help")}</a>`;

export function renderActionConsole(input: ActionConsoleInput): string {
  return `
    <section class="step" id="action-console" ${input.visible ? "" : "hidden"}>
      <div class="step__head"><span class="step__num">3</span><h2 class="step__title">${t("step.action.title")}</h2></div>

      <div class="task-card" id="task-card">${renderTaskHeader(input.headerLabel)}${renderReadyView(input.locale)}${renderProcessingView()}${renderCompletedView()}${renderFailedView()}
      </div>${renderLogDisclosure()}
    </section>`;
}
