import { OverallStatus, SystemStatusSnapshot, TranslationStats } from "../types";
import { formatUtcTimestamp } from "../timeFormat";
import {
  formatCompactMetric,
  renderDayTranslationsBadge,
  renderServiceStatusBadge,
  renderTotalTranslationsBadge,
  renderUptimeBadge,
} from "./badge";
import { escapeHtml } from "./html";
import { buildFaviconDataUri, OVERALL_CONFIG } from "./overall";
import { RenderContext } from "./page";
import { BASE_STYLES, THEME_TOKENS } from "./theme";

interface BadgeItem {
  id: string;
  name: string;
  description: string;
  badgePath: string;
  badgeSvg: string;
  currentValue: string;
  statusClass: string;
}

const BADGES_PAGE_STYLES = `${THEME_TOKENS}
${BASE_STYLES}
    html {
      overflow-y: scroll;
      scrollbar-gutter: stable;
    }
    .skip-link {
      position: absolute;
      top: -100px;
      left: 1rem;
      background: var(--text-primary);
      color: var(--bg-page);
      padding: 0.75rem 1.25rem;
      font-weight: 700;
      font-size: 0.875rem;
      text-decoration: none;
      z-index: 1000;
      border-radius: 0 0 6px 6px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
      transition: top 0.15s ease-in-out;
    }
    .skip-link:focus {
      top: 0;
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }
    /* Fixed position prevents the browser from scrolling the viewport when a label activates the radio */
    .fmt-radio {
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      opacity: 0;
      border: 0;
      margin: 0;
      padding: 0;
      z-index: -1;
    }
    #fmt-md:focus-visible ~ .layout-container .pill-md,
    #fmt-html:focus-visible ~ .layout-container .pill-html,
    #fmt-url:focus-visible ~ .layout-container .pill-url,
    a:focus-visible, button:focus-visible, label.pill-btn:focus-visible, [tabindex="0"]:focus-visible, summary:focus-visible, input:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
      border-radius: 4px;
    }
    /* Standard text selection across all informational, card, and textual elements */
    *, *::before, *::after {
      user-select: text;
      -webkit-user-select: text;
    }
    /* Interactive buttons and icons avoid accidental drag highlight */
    button, input[type="radio"], select, label.pill-btn, .pulse-dot, svg {
      user-select: none;
      -webkit-user-select: none;
    }
    /* Code and input fields must always be freely selectable with cursor */
    .snippet-input, code, pre, .badge-card {
      user-select: text !important;
      -webkit-user-select: text !important;
    }
    .layout-container {
      width: 100%;
      max-width: 960px;
      margin: 0 auto;
      padding: 0 clamp(1rem, 3vw, 2rem);
      flex: 1;
    }
    header.site-header {
      width: 100%;
      padding: 1rem clamp(1rem, 3.5vw, 3rem);
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 0.875rem;
    }
    .brand-group {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .brand-wrap {
      display: inline-flex;
      align-items: center;
      text-decoration: none;
      color: inherit;
    }
    .brand-title {
      font-size: 1.0625rem;
      font-weight: 600;
      letter-spacing: -0.015em;
      line-height: 1.3;
    }
    .brand-sub {
      font-size: 0.75rem;
      color: var(--text-secondary);
      line-height: 1.3;
    }
    .header-links {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.875rem;
      font-size: 0.8125rem;
    }
    .header-links a {
      color: var(--text-secondary);
      text-decoration: none;
      font-weight: 500;
      font-size: 0.875rem;
      padding: 0.25rem 0.375rem;
      border-radius: 6px;
      transition: color 0.15s ease;
      line-height: 1.3;
    }
    .header-links a:hover {
      color: var(--text-primary);
    }
    .no-js .js-only {
      display: none !important;
    }
    .js-only {
      display: inline-flex;
      align-items: center;
    }
    .panel {
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.5rem;
      background: var(--bg-card);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }
    .hero-panel {
      background-color: var(--bg-card);
    }
    .hero-top {
      margin-bottom: 1rem;
    }
    .hero-title-group h1 {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.015em;
      color: var(--text-primary);
      margin: 0 0 0.35rem;
    }
    .hero-desc {
      font-size: 0.875rem;
      color: var(--text-secondary);
      line-height: 1.5;
      margin: 0;
    }
    .metrics-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
      margin-top: 1.25rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-subtle);
    }
    .metric-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }
    .metric-label {
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .metric-value {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 0.45rem;
      white-space: nowrap;
    }
    .status-value {
      font-size: 1.0625rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      display: inline-block;
      flex-shrink: 0;
    }
    .pulse-dot.dot-degraded { background: #f59e0b; }
    .pulse-dot.dot-outage { background: #ef4444; }
    .pulse-dot.dot-maintenance { background: #2563eb; }

    /* Unified Badges Section Panel */
    .badges-panel {
      padding: 1.5rem;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1.25rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .panel-header-title h2.panel-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0 0 0.25rem 0;
      letter-spacing: -0.015em;
    }
    .panel-header-title p.panel-subtitle {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.4;
    }
    /* Synchronized equal-width 3-column grid prevents any horizontal jitter on option toggle */
    .format-pills {
      display: inline-grid;
      grid-template-columns: repeat(3, 104px);
      background: var(--bg-subtle);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      gap: 4px;
      box-sizing: border-box;
      width: max-content;
      max-width: 100%;
    }
    .pill-btn {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: transparent;
      border: 1px solid transparent;
      padding: 0.35rem 0.5rem;
      border-radius: 6px;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 104px;
      box-sizing: border-box;
      text-align: center;
      line-height: 1.3;
      white-space: nowrap;
      margin: 0;
    }
    .pill-btn:hover {
      color: var(--text-primary);
    }
    /* Pure CSS format toggles via :checked pseudo-class on fixed-position radio inputs */
    #fmt-md:checked ~ .layout-container .pill-md,
    #fmt-html:checked ~ .layout-container .pill-html,
    #fmt-url:checked ~ .layout-container .pill-url {
      color: var(--text-primary);
      background: var(--bg-card);
      border-color: var(--border-subtle);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      font-weight: 600;
    }
    .snippet-view {
      display: none;
      width: 100%;
    }
    #fmt-md:checked ~ .layout-container .snippet-md,
    #fmt-html:checked ~ .layout-container .snippet-html,
    #fmt-url:checked ~ .layout-container .snippet-url {
      display: block;
    }
    .badges-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.25rem;
    }
    .badge-card {
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .badge-card:hover {
      border-color: var(--border-strong);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
    }
    .badge-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      min-height: 28px;
    }
    .badge-card-title {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
      letter-spacing: -0.01em;
    }
    .badge-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: var(--bg-card);
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      border: 1px solid var(--border-subtle);
      white-space: nowrap;
      flex-shrink: 0;
    }
    /* Fixed 2-line height ensures sibling cards have strictly aligned badge stages */
    .badge-card-desc {
      font-size: 0.75rem;
      color: var(--text-muted);
      line-height: 1.4;
      margin: 0;
      min-height: 2.8rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .badge-stage {
      padding: 0.75rem;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 48px;
      box-sizing: border-box;
    }
    .badge-stage svg {
      max-width: 100%;
      height: 20px;
      display: block;
    }
    /* Uneditable input box single-line container */
    .snippet-input-group {
      display: flex;
      align-items: stretch;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      overflow: hidden;
      height: 38px;
      box-sizing: border-box;
      transition: border-color 0.15s ease;
    }
    .snippet-input-group:focus-within {
      border-color: var(--focus-ring);
    }
    .snippet-input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.75rem;
      color: var(--text-primary);
      padding: 0 0.75rem;
      line-height: 36px;
      height: 36px;
      cursor: text;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      outline: none;
      user-select: text;
      -webkit-user-select: text;
    }
    .snippet-input:focus,
    .snippet-input:hover {
      text-overflow: clip;
    }
    .no-js .snippet-input {
      overflow-x: auto;
      text-overflow: clip;
    }
    .copy-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-family: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: var(--bg-subtle);
      border: none;
      border-left: 1px solid var(--border-subtle);
      padding: 0 0.75rem;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      flex-shrink: 0;
      height: 100%;
    }
    .copy-btn:hover {
      color: var(--text-primary);
      background: var(--bg-card);
    }
    .copy-btn.copied {
      color: #10b981;
      background: rgba(16, 185, 129, 0.12);
    }
    .badge-card-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-top: 0.35rem;
      font-size: 0.75rem;
    }
    .badge-open-link {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--link-color);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.15s ease;
    }
    .badge-open-link:hover {
      text-decoration: underline;
    }
    .back-to-app {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: 48px;
      margin-bottom: 2rem;
      padding: 0.75rem 1.25rem;
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      background: var(--bg-card);
      color: var(--text-primary);
      font-weight: 600;
      font-size: 0.9375rem;
      text-decoration: none;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    .back-to-app svg {
      transition: transform 0.15s ease;
    }
    .back-to-app:hover,
    .back-to-app:focus-visible {
      background: var(--link-ext-hover);
      border-color: var(--border-strong);
    }
    .back-to-app:hover svg,
    .back-to-app:focus-visible svg {
      transform: translateX(-3px);
    }
    footer.site-footer {
      width: 100%;
      margin-top: 2rem;
      padding: 1.5rem clamp(1rem, 3.5vw, 3rem) 2rem clamp(1rem, 3.5vw, 3rem);
      border-top: 1px solid var(--border-subtle);
      font-size: 0.8125rem;
      color: var(--text-secondary);
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .footer-primary {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    .footer-brand-block {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .footer-brand-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.01em;
    }
    .footer-brand-desc {
      font-size: 0.75rem;
      color: var(--text-muted);
      line-height: 1.4;
    }
    .footer-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.875rem;
      align-items: center;
    }
    .footer-nav-item {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--text-secondary);
      text-decoration: none;
      line-height: 1.3;
      white-space: nowrap;
      transition: color 0.15s ease;
    }
    .footer-nav-item:hover {
      color: var(--text-primary);
    }
    .footer-secondary {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      padding-top: 1rem;
      border-top: 1px dashed var(--border-subtle);
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .footer-copyright {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .footer-sep {
      color: var(--border-strong);
    }
    .icon-sub {
      width: 0.875rem;
      height: 0.875rem;
      flex-shrink: 0;
      display: inline-block;
      vertical-align: middle;
    }
    @media (max-width: 768px) {
      .badges-grid {
        grid-template-columns: 1fr;
      }
      .badge-card-desc {
        min-height: auto;
      }
      .metrics-row {
        grid-template-columns: 1fr 1fr;
      }
    }
    @media (max-width: 640px) {
      .layout-container {
        padding: 0 0.75rem;
      }
      header.site-header {
        padding: 1.25rem 0.75rem 1rem 0.75rem;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 0.75rem;
      }
      .brand-group {
        align-items: center;
        text-align: center;
      }
      .header-links {
        width: 100%;
        justify-content: center;
        gap: 0.75rem;
      }
      .panel-header {
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .panel-header-title {
        text-align: center;
      }
      .format-pills {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        width: 100%;
        max-width: 360px;
      }
      .pill-btn {
        width: 100%;
      }
      footer.site-footer {
        padding: 1.5rem 0.75rem 2rem 0.75rem;
        text-align: center;
      }
      .footer-primary {
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 1rem;
      }
      .footer-brand-block {
        align-items: center;
        text-align: center;
      }
      .footer-nav {
        width: 100%;
        justify-content: center;
        gap: 0.75rem;
      }
      .footer-secondary {
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 0.5rem;
      }
    }
`;

function buildBadgesList(
  snapshot: SystemStatusSnapshot,
  stats?: TranslationStats | null,
): BadgeItem[] {
  const overallStatus = snapshot.summary.overallStatus;
  const overallShort =
    overallStatus === "operational"
      ? "Operational"
      : overallStatus === "degraded"
      ? "Degraded"
      : overallStatus === "major_outage"
      ? "Major Outage"
      : "Maintenance";

  return [
    {
      id: "service-status",
      name: "Service Status",
      description: "Real-time overall operational availability of the subtitle translator service",
      badgePath: "badges/status/service.svg",
      badgeSvg: renderServiceStatusBadge(overallStatus),
      currentValue: overallShort,
      statusClass: `dot-${overallStatus}`,
    },
    {
      id: "rolling-uptime",
      name: "Rolling 90-Day Uptime",
      description: "Continuous availability percentage over the rolling 90-day monitoring window",
      badgePath: "badges/status/uptime.svg",
      badgeSvg: renderUptimeBadge(snapshot.summary.rolling90dRatio),
      currentValue: `${snapshot.summary.rolling90dRatio.toFixed(2)}%`,
      statusClass: "dot-operational",
    },
    {
      id: "translations-total",
      name: "Total Translations",
      description: "Cumulative count of successfully translated subtitle files and tasks",
      badgePath: "badges/translations/total.svg",
      badgeSvg: renderTotalTranslationsBadge(stats?.total ?? 0),
      currentValue: `${formatCompactMetric(stats?.total ?? 0)} total`,
      statusClass: "dot-operational",
    },
    {
      id: "translations-24h",
      name: "Past 24-Hour Translations",
      description: "Number of subtitle translation jobs processed during the last 24 hours",
      badgePath: "badges/translations/24h.svg",
      badgeSvg: renderDayTranslationsBadge(stats?.last24h ?? 0),
      currentValue: `${formatCompactMetric(stats?.last24h ?? 0)} in 24h`,
      statusClass: "dot-operational",
    },
  ];
}

function renderBadgeCard(item: BadgeItem, baseUrl: string): string {
  const fullUrl = `${baseUrl}/${item.badgePath}`;
  const markdownSnippet = `![${item.name}](${fullUrl})`;
  const htmlSnippet = `<img src="${fullUrl}" alt="${escapeHtml(item.name)}" />`;
  const urlSnippet = fullUrl;

  return `
    <article class="badge-card">
      <div class="badge-card-header">
        <h3 class="badge-card-title">${escapeHtml(item.name)}</h3>
        <span class="badge-status-pill">
          <span class="pulse-dot ${escapeHtml(item.statusClass)}" aria-hidden="true"></span>
          <span>${escapeHtml(item.currentValue)}</span>
        </span>
      </div>
      <p class="badge-card-desc">${escapeHtml(item.description)}</p>
      <div class="badge-stage" role="img" aria-label="${escapeHtml(item.name)} live badge preview">
        ${item.badgeSvg}
      </div>
      <div class="badge-snippet-wrap">
        <div class="snippet-view snippet-md">
          <div class="snippet-input-group">
            <input
              type="text"
              class="snippet-input"
              readonly
              value="${escapeHtml(markdownSnippet)}"
              title="${escapeHtml(markdownSnippet)}"
              aria-label="${escapeHtml(item.name)} Markdown embed code"
              spellcheck="false"
            />
            <button
              type="button"
              class="copy-btn js-only"
              data-copy="${escapeHtml(markdownSnippet)}"
              aria-label="Copy Markdown code"
              title="Copy to clipboard"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            </button>
          </div>
        </div>
        <div class="snippet-view snippet-html">
          <div class="snippet-input-group">
            <input
              type="text"
              class="snippet-input"
              readonly
              value="${escapeHtml(htmlSnippet)}"
              title="${escapeHtml(htmlSnippet)}"
              aria-label="${escapeHtml(item.name)} HTML embed code"
              spellcheck="false"
            />
            <button
              type="button"
              class="copy-btn js-only"
              data-copy="${escapeHtml(htmlSnippet)}"
              aria-label="Copy HTML code"
              title="Copy to clipboard"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            </button>
          </div>
        </div>
        <div class="snippet-view snippet-url">
          <div class="snippet-input-group">
            <input
              type="text"
              class="snippet-input"
              readonly
              value="${escapeHtml(urlSnippet)}"
              title="${escapeHtml(urlSnippet)}"
              aria-label="${escapeHtml(item.name)} Raw SVG URL"
              spellcheck="false"
            />
            <button
              type="button"
              class="copy-btn js-only"
              data-copy="${escapeHtml(urlSnippet)}"
              aria-label="Copy URL"
              title="Copy to clipboard"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            </button>
          </div>
        </div>
      </div>
      <div class="badge-card-footer">
        <a class="badge-open-link" href="${escapeHtml(fullUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(item.name)} raw SVG in new tab">
          <span>Raw SVG</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
      </div>
    </article>
  `;
}

const BADGES_CLIENT_SCRIPT = `
(function() {
  var pills = Array.from(document.querySelectorAll('.pill-btn'));

  function copyText(text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        onCopied(btn);
      }).catch(function() {
        fallbackCopy(text, btn);
      });
    } else {
      fallbackCopy(text, btn);
    }
  }

  function fallbackCopy(text, btn) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      onCopied(btn);
    } catch(e) {
    }
    document.body.removeChild(ta);
  }

  function onCopied(btn) {
    btn.classList.add('copied');
    var span = btn.querySelector('span');
    if (span) span.textContent = 'Copied!';
    setTimeout(function() {
      btn.classList.remove('copied');
      if (span) span.textContent = 'Copy';
    }, 1800);
  }

  function updateAriaRadio() {
    pills.forEach(function(p) {
      var targetId = p.getAttribute('for');
      var radio = targetId ? document.getElementById(targetId) : null;
      var isChecked = Boolean(radio && radio.checked);
      p.setAttribute('aria-checked', isChecked ? 'true' : 'false');
    });
  }

  pills.forEach(function(pill, idx) {
    pill.addEventListener('mousedown', function(e) {
      e.preventDefault();
      var targetId = pill.getAttribute('for');
      if (targetId) {
        var radio = document.getElementById(targetId);
        if (radio) {
          var prevY = window.pageYOffset || document.documentElement.scrollTop;
          radio.checked = true;
          updateAriaRadio();
          if (window.scrollTo) {
            window.scrollTo({ top: prevY, left: 0, behavior: 'instant' });
          }
        }
      }
    });

    pill.addEventListener('click', function(e) {
      e.preventDefault();
      var targetId = pill.getAttribute('for');
      if (targetId) {
        var radio = document.getElementById(targetId);
        if (radio && !radio.checked) {
          var prevY = window.pageYOffset || document.documentElement.scrollTop;
          radio.checked = true;
          updateAriaRadio();
          if (window.scrollTo) {
            window.scrollTo({ top: prevY, left: 0, behavior: 'instant' });
          }
        }
      }
    });

    pill.addEventListener('keydown', function(e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        var targetId = pill.getAttribute('for');
        if (targetId) {
          var radio = document.getElementById(targetId);
          if (radio) {
            radio.checked = true;
            updateAriaRadio();
          }
        }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        var next = pills[(idx + 1) % pills.length];
        next.focus({ preventScroll: true });
        var nextId = next.getAttribute('for');
        if (nextId) {
          var radioNext = document.getElementById(nextId);
          if (radioNext) {
            radioNext.checked = true;
            updateAriaRadio();
          }
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        var prev = pills[(idx - 1 + pills.length) % pills.length];
        prev.focus({ preventScroll: true });
        var prevId = prev.getAttribute('for');
        if (prevId) {
          var radioPrev = document.getElementById(prevId);
          if (radioPrev) {
            radioPrev.checked = true;
            updateAriaRadio();
          }
        }
      }
    });
  });

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.copy-btn');
    if (!btn) return;
    var text = btn.getAttribute('data-copy') || '';
    if (text) copyText(text, btn);
  });
})();
`;

export function renderBadgesHtml(
  snapshot: SystemStatusSnapshot,
  ctx: RenderContext,
  stats?: TranslationStats | null,
): string {
  const overallKey = snapshot.summary.overallStatus || "operational";
  const overallShort =
    overallKey === "operational"
      ? "Operational"
      : overallKey === "degraded"
      ? "Degraded"
      : overallKey === "major_outage"
      ? "Major Outage"
      : "Maintenance";

  const statusBase = ctx.statusUrl.replace(/\/+$/, "");
  const badgeItems = buildBadgesList(snapshot, stats);
  const totalBadges = badgeItems.length;

  const generatedDate = snapshot.meta.generatedAt ? new Date(snapshot.meta.generatedAt) : new Date();
  const currentYear = isNaN(generatedDate.getTime()) ? new Date().getUTCFullYear() : generatedDate.getUTCFullYear();

  const cardsHtml = badgeItems.map((item) => renderBadgeCard(item, statusBase)).join("");

  return `<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
  <meta charset="utf-8" />
  <script>document.documentElement.classList.replace('no-js','js');</script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta name="color-scheme" content="light dark" />
  <title>Status Badges | Montage Subtitle Translator</title>
  <meta name="description" content="Embeddable live SVG status badges for Montage Subtitle Translator services and metrics." />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${escapeHtml(statusBase)}/badges/" />
  <link rel="icon" type="image/svg+xml" href="${buildFaviconDataUri(overallKey)}" />
  <style>
${BADGES_PAGE_STYLES}
  </style>
</head>
<body>
  <a href="#main-content" class="skip-link" title="Skip navigation and jump to main content">Skip to main content</a>
  <!-- Accessible radio inputs allowing pure CSS format switching in both JS and No-JS environments -->
  <input type="radio" name="fmt-view" id="fmt-md" class="fmt-radio sr-only" value="markdown" aria-label="Markdown format" checked />
  <input type="radio" name="fmt-view" id="fmt-html" class="fmt-radio sr-only" value="html" aria-label="HTML format" />
  <input type="radio" name="fmt-view" id="fmt-url" class="fmt-radio sr-only" value="url" aria-label="Direct URL format" />

  <header class="site-header" role="banner">
    <div class="brand-group">
      <a class="brand-wrap" href="${escapeHtml(statusBase)}/" title="Status Overview">
        <span class="brand-title">Montage Subtitle Translator Status</span>
      </a>
      <span class="brand-sub">Service Availability &amp; Incident Monitoring</span>
    </div>
    <nav class="header-links" aria-label="Navigation">
      <a href="${escapeHtml(statusBase)}/" title="Status Page">Overview</a>
      <a href="${escapeHtml(ctx.mainSiteUrl)}" title="Main App">Main App</a>
      <a href="${escapeHtml(ctx.issueReportUrl)}" title="Report Issue">Report Issue</a>
    </nav>
  </header>

  <main id="main-content" class="layout-container" role="main">
    <section class="panel hero-panel" aria-labelledby="badges-hero-title">
      <div class="hero-top">
        <div class="hero-title-group">
          <h1 id="badges-hero-title">Status Badges</h1>
          <p class="hero-desc">
            Production-grade live SVG badges representing real-time subtitle translation operational availability, rolling uptime, and processing metrics.
          </p>
        </div>
      </div>

      <div class="metrics-row" aria-label="Status Badges Metrics">
        <div class="metric-item">
          <span class="metric-label">Available Badges</span>
          <span class="metric-value">${totalBadges} Badges</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Overall Service</span>
          <span class="metric-value status-value">
            <span class="pulse-dot dot-${escapeHtml(overallKey)}" aria-hidden="true"></span>
            <span>${escapeHtml(overallShort)}</span>
          </span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Rolling 90d Uptime</span>
          <span class="metric-value">${snapshot.summary.rolling90dRatio.toFixed(2)}%</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Edge Cache TTL</span>
          <span class="metric-value">60s (Auto)</span>
        </div>
      </div>
    </section>

    <!-- Unified Badges Section Panel -->
    <section class="panel badges-panel" aria-labelledby="badges-panel-title">
      <div class="panel-header">
        <div class="panel-header-title">
          <h2 id="badges-panel-title" class="panel-title">Available Badges</h2>
          <p class="panel-subtitle">Select an embed format to preview and copy badge snippet code</p>
        </div>
        <div class="format-pills" role="radiogroup" aria-label="Badge embed format">
          <label for="fmt-md" class="pill-btn pill-md" tabindex="0" role="radio" aria-checked="true" aria-controls="badges-container">Markdown</label>
          <label for="fmt-html" class="pill-btn pill-html" tabindex="0" role="radio" aria-checked="false" aria-controls="badges-container">HTML</label>
          <label for="fmt-url" class="pill-btn pill-url" tabindex="0" role="radio" aria-checked="false" aria-controls="badges-container">Direct URL</label>
        </div>
      </div>

      <div class="badges-grid" id="badges-container">
        ${cardsHtml}
      </div>
    </section>

    <a class="back-to-app" href="${escapeHtml(statusBase)}/" title="Back to Status Overview">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      <span>Back to Status Overview</span>
    </a>
  </main>

  <footer class="site-footer" role="contentinfo">
    <div class="footer-primary">
      <div class="footer-brand-block">
        <div class="footer-brand-title">Montage Subtitle Translator Status</div>
        <div class="footer-brand-desc">Service health and operational status.</div>
      </div>
      <nav class="footer-nav" aria-label="Status page resources">
        <a class="footer-nav-item" href="${escapeHtml(statusBase)}/status.json" target="_blank" rel="noopener noreferrer" title="Status API" aria-label="Status API"><svg class="icon-sub" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>Status API</a>
        <a class="footer-nav-item" href="${escapeHtml(ctx.githubRepoUrl)}" target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="GitHub"><svg class="icon-sub" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>GitHub</a>
        <a class="footer-nav-item" href="${escapeHtml(ctx.mainSiteUrl.replace(/\/+$/, ""))}/docs/terms/" target="_blank" rel="noopener noreferrer" title="Terms of Service" aria-label="Terms of Service">Terms</a>
        <a class="footer-nav-item" href="${escapeHtml(ctx.mainSiteUrl.replace(/\/+$/, ""))}/docs/privacy/" target="_blank" rel="noopener noreferrer" title="Privacy Policy" aria-label="Privacy Policy">Privacy</a>
      </nav>
    </div>

    <div class="footer-secondary">
      <div class="footer-copyright">
        <span>&copy; ${currentYear} MontageSubs</span>
        <span class="footer-sep" aria-hidden="true">&bull;</span>
        <span class="footer-engine-version" aria-label="Status monitoring engine version">Montage Status System</span>
      </div>
      <div class="footer-meta-block">
        <span class="footer-timestamp-label">Updated:</span>
        <span class="footer-timestamp"><time datetime="${escapeHtml(snapshot.meta.generatedAt)}" data-utc="${escapeHtml(formatUtcTimestamp(snapshot.meta.generatedAt))}">${escapeHtml(formatUtcTimestamp(snapshot.meta.generatedAt))}</time></span>
      </div>
    </div>
  </footer>

  <script>
${BADGES_CLIENT_SCRIPT}
  </script>
</body>
</html>`;
}
