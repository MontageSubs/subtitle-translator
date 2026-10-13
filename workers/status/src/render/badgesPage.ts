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
    .fmt-radio {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    a:focus-visible, button:focus-visible, label.pill-btn:focus-visible, code:focus-visible {
      outline: 2px solid var(--link-color);
      outline-offset: 2px;
      border-radius: 4px;
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
      background-color: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
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
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--text-secondary);
      text-decoration: none;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      padding: 0.35rem 0.75rem;
      border-radius: 6px;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .back-btn:hover {
      color: var(--text-primary);
      border-color: var(--border-strong);
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
      gap: 0.2rem;
    }
    .metric-label {
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }
    .metric-value {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 0.4rem;
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
    .controls-panel {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      padding: 0.875rem 1.25rem;
    }
    .controls-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    .format-pills {
      display: inline-flex;
      background: var(--bg-subtle);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      gap: 2px;
    }
    .pill-btn {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--text-secondary);
      background: transparent;
      border: 1px solid transparent;
      padding: 0.35rem 0.85rem;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
      display: inline-flex;
      align-items: center;
    }
    .pill-btn:hover {
      color: var(--text-primary);
    }
    /* Pure CSS format toggles via :checked pseudo-class on hidden radio inputs */
    #fmt-md:checked ~ .layout-container .controls-panel .pill-md,
    #fmt-html:checked ~ .layout-container .controls-panel .pill-html,
    #fmt-url:checked ~ .layout-container .controls-panel .pill-url {
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
    #fmt-md:checked ~ .layout-container .badges-grid .snippet-md,
    #fmt-html:checked ~ .layout-container .badges-grid .snippet-html,
    #fmt-url:checked ~ .layout-container .badges-grid .snippet-url {
      display: block;
    }
    .badges-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .badge-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      transition: border-color 0.15s ease;
    }
    .badge-card:hover {
      border-color: var(--border-strong);
    }
    .badge-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .badge-card-title {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }
    .badge-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: var(--bg-subtle);
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      border: 1px solid var(--border-subtle);
      white-space: nowrap;
    }
    .badge-card-desc {
      font-size: 0.75rem;
      color: var(--text-muted);
      line-height: 1.4;
      margin: 0;
    }
    .badge-stage {
      padding: 0.875rem;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
    }
    .badge-stage svg {
      max-width: 100%;
      height: 20px;
      display: block;
    }
    .snippet-code-wrap {
      display: flex;
      align-items: stretch;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      overflow: hidden;
    }
    .snippet-code {
      flex: 1;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.75rem;
      line-height: 1.45;
      color: var(--text-primary);
      padding: 0.625rem 0.75rem;
      white-space: pre-wrap;
      word-break: break-all;
      user-select: all;
      -webkit-user-select: all;
      background: transparent;
      outline: none;
    }
    .copy-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-family: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: var(--bg-card);
      border: none;
      border-left: 1px solid var(--border-subtle);
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .copy-btn:hover {
      color: var(--text-primary);
      background: var(--bg-subtle);
    }
    .copy-btn.copied {
      color: #10b981;
      background: rgba(16, 185, 129, 0.1);
    }
    .badge-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 0.5rem;
      border-top: 1px solid var(--border-subtle);
      font-size: 0.75rem;
    }
    .badge-open-link {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--link-color);
      text-decoration: none;
      font-weight: 500;
      margin-left: auto;
      transition: color 0.15s ease;
    }
    .badge-open-link:hover {
      text-decoration: underline;
    }
    .embed-guide h2 {
      font-size: 1.0625rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 0.5rem;
    }
    .embed-guide p {
      font-size: 0.875rem;
      color: var(--text-secondary);
      line-height: 1.5;
      margin: 0 0 1.25rem;
    }
    .guide-blocks {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1rem;
    }
    .guide-block {
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 1rem;
    }
    .guide-block h3 {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 0.5rem;
    }
    .guide-block pre {
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.75rem;
      color: var(--text-primary);
      white-space: pre-wrap;
      word-break: break-all;
      background: var(--bg-card);
      padding: 0.6rem 0.75rem;
      border-radius: 4px;
      border: 1px solid var(--border-subtle);
    }
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #0f172a;
      color: #fff;
      padding: 0.65rem 1.2rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    footer.site-footer {
      width: 100%;
      margin-top: 2.5rem;
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
      .controls-panel {
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .format-pills {
        width: 100%;
        justify-content: center;
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
  const overallText = OVERALL_CONFIG[overallStatus]?.title || overallStatus;

  return [
    {
      id: "service-status",
      name: "Service Status",
      description: "Real-time overall operational availability of the subtitle translator service",
      badgePath: "badges/status/service.svg",
      badgeSvg: renderServiceStatusBadge(overallStatus),
      currentValue: overallText,
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
      currentValue: `${formatCompactMetric(stats?.total ?? 0)} completed`,
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
        <h2 class="badge-card-title">${escapeHtml(item.name)}</h2>
        <span class="badge-status-pill">
          <span class="pulse-dot ${escapeHtml(item.statusClass)}" aria-hidden="true"></span>
          <span>${escapeHtml(item.currentValue)}</span>
        </span>
      </div>
      <p class="badge-card-desc">${escapeHtml(item.description)}</p>
      <div class="badge-stage">
        ${item.badgeSvg}
      </div>
      <div class="badge-snippet-wrap">
        <div class="snippet-view snippet-md">
          <div class="snippet-code-wrap">
            <code class="snippet-code" tabindex="0">${escapeHtml(markdownSnippet)}</code>
            <button type="button" class="copy-btn js-only" data-copy="${escapeHtml(markdownSnippet)}" aria-label="Copy Markdown code" title="Copy to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            </button>
          </div>
        </div>
        <div class="snippet-view snippet-html">
          <div class="snippet-code-wrap">
            <code class="snippet-code" tabindex="0">${escapeHtml(htmlSnippet)}</code>
            <button type="button" class="copy-btn js-only" data-copy="${escapeHtml(htmlSnippet)}" aria-label="Copy HTML code" title="Copy to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            </button>
          </div>
        </div>
        <div class="snippet-view snippet-url">
          <div class="snippet-code-wrap">
            <code class="snippet-code" tabindex="0">${escapeHtml(urlSnippet)}</code>
            <button type="button" class="copy-btn js-only" data-copy="${escapeHtml(urlSnippet)}" aria-label="Copy URL" title="Copy to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            </button>
          </div>
        </div>
      </div>
      <div class="badge-card-footer">
        <a class="badge-open-link" href="${escapeHtml(fullUrl)}" target="_blank" rel="noopener noreferrer">
          <span>Raw SVG</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
      </div>
    </article>
  `;
}

const BADGES_CLIENT_SCRIPT = `
(function() {
  var toast = document.getElementById('copy-toast');
  var toastTimer = null;

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() {
      toast.classList.remove('show');
    }, 2000);
  }

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
      showToast('Copy failed');
    }
    document.body.removeChild(ta);
  }

  function onCopied(btn) {
    showToast('Copied to clipboard!');
    btn.classList.add('copied');
    var span = btn.querySelector('span');
    if (span) span.textContent = 'Copied!';
    setTimeout(function() {
      btn.classList.remove('copied');
      if (span) span.textContent = 'Copy';
    }, 1800);
  }

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
  <!-- Hidden radio inputs allow pure CSS format switching in both JS and No-JS environments -->
  <input type="radio" name="fmt-view" id="fmt-md" class="fmt-radio sr-only" checked aria-hidden="true" />
  <input type="radio" name="fmt-view" id="fmt-html" class="fmt-radio sr-only" aria-hidden="true" />
  <input type="radio" name="fmt-view" id="fmt-url" class="fmt-radio sr-only" aria-hidden="true" />

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
            Production-grade live SVG badges representing real-time system status, rolling uptime, and service metrics. Embed them directly into your GitHub README, documentation, and external monitors.
          </p>
        </div>
        <a class="back-btn" href="${escapeHtml(statusBase)}/">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          <span>Back to Status</span>
        </a>
      </div>

      <div class="metrics-row" aria-label="Status Badges Metrics">
        <div class="metric-item">
          <span class="metric-label">Available Badges</span>
          <span class="metric-value">${totalBadges}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Overall Service</span>
          <span class="metric-value">
            <span class="pulse-dot dot-${escapeHtml(overallKey)}" aria-hidden="true"></span>
            <span>${escapeHtml(OVERALL_CONFIG[overallKey]?.title || overallKey)}</span>
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

    <section class="panel controls-panel" aria-label="Snippet Format Controls">
      <span class="controls-title">Badge Embed Format:</span>
      <div class="format-pills" role="radiogroup" aria-label="Snippet format">
        <label for="fmt-md" class="pill-btn pill-md" tabindex="0">Markdown</label>
        <label for="fmt-html" class="pill-btn pill-html" tabindex="0">HTML</label>
        <label for="fmt-url" class="pill-btn pill-url" tabindex="0">Direct URL</label>
      </div>
    </section>

    <div class="badges-grid" id="badges-container">
      ${cardsHtml}
    </div>

    <section class="panel embed-guide" aria-labelledby="guide-title">
      <h2 id="guide-title">Integration &amp; Embedding Guide</h2>
      <p>
        All badges are served as standard, cache-optimized SVGs with CORS enabled (<code>Access-Control-Allow-Origin: *</code>). They update automatically every status cycle and render crisp on all displays.
      </p>
      <div class="guide-blocks">
        <div class="guide-block">
          <h3>Markdown with Status Link</h3>
          <pre><code>[![Service Status](${escapeHtml(statusBase)}/badges/status/service.svg)](${escapeHtml(statusBase)}/)</code></pre>
        </div>
        <div class="guide-block">
          <h3>HTML Image Tag</h3>
          <pre><code>&lt;a href="${escapeHtml(statusBase)}/"&gt;
  &lt;img src="${escapeHtml(statusBase)}/badges/status/service.svg" alt="Service Status" /&gt;
&lt;/a&gt;</code></pre>
        </div>
        <div class="guide-block">
          <h3>Caching &amp; Edge Delivery</h3>
          <pre><code>Cache-Control: public, max-age=60, s-maxage=60
Content-Type: image/svg+xml; charset=utf-8</code></pre>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer" role="contentinfo">
    <div class="footer-primary">
      <div class="footer-brand-block">
        <div class="footer-brand-title">Montage Subtitle Translator Status</div>
        <div class="footer-brand-desc">Service health and operational status.</div>
      </div>
      <nav class="footer-nav" aria-label="Status page resources">
        <a class="footer-nav-item" href="${escapeHtml(statusBase)}/status.json" target="_blank" rel="noopener noreferrer" title="Status API"><svg class="icon-sub" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>Status API</a>
        <a class="footer-nav-item" href="${escapeHtml(statusBase)}/" title="Status Overview"><svg class="icon-sub" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>Status Overview</a>
        <a class="footer-nav-item" href="${escapeHtml(ctx.githubRepoUrl)}" target="_blank" rel="noopener noreferrer" title="GitHub"><svg class="icon-sub" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>GitHub</a>
        <a class="footer-nav-item" href="${escapeHtml(ctx.mainSiteUrl)}docs/terms/" target="_blank" rel="noopener noreferrer" title="Terms of Service">Terms</a>
        <a class="footer-nav-item" href="${escapeHtml(ctx.mainSiteUrl)}docs/privacy/" target="_blank" rel="noopener noreferrer" title="Privacy Policy">Privacy</a>
      </nav>
    </div>

    <div class="footer-secondary">
      <div class="footer-copyright">
        <span>&copy; ${currentYear} MontageSubs</span>
        <span class="footer-sep" aria-hidden="true">&bull;</span>
        <span class="footer-engine-version">Montage Status System</span>
      </div>
      <div class="footer-meta-block">
        <span class="footer-timestamp-label">Updated:</span>
        <span class="footer-timestamp"><time datetime="${escapeHtml(snapshot.meta.generatedAt)}" data-utc="${escapeHtml(formatUtcTimestamp(snapshot.meta.generatedAt))}">${escapeHtml(formatUtcTimestamp(snapshot.meta.generatedAt))}</time></span>
      </div>
    </div>
  </footer>

  <div id="copy-toast" class="toast" role="status" aria-live="polite">Copied to clipboard!</div>

  <script>
${BADGES_CLIENT_SCRIPT}
  </script>
</body>
</html>`;
}
