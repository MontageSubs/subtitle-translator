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
import { buildFaviconDataUri } from "./overall";
import { RenderContext } from "./page";
import { BADGES_CLIENT_SCRIPT } from "./badgesClientScript";
import { BADGES_PAGE_STYLES } from "./badgesStyles";

const OVERALL_SHORT_LABELS: Record<OverallStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  major_outage: "Major Outage",
  maintenance: "Maintenance",
};

const overallShortLabel = (status: OverallStatus): string => OVERALL_SHORT_LABELS[status] ?? OVERALL_SHORT_LABELS.maintenance;

interface BadgeItem {
  id: string;
  name: string;
  description: string;
  badgePath: string;
  badgeSvg: string;
  currentValue: string;
  statusClass: string;
}

function buildBadgesList(
  snapshot: SystemStatusSnapshot,
  stats?: TranslationStats | null,
): BadgeItem[] {
  const overallStatus = snapshot.summary.overallStatus;
  const overallShort = overallShortLabel(overallStatus);

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

export function renderBadgesHtml(
  snapshot: SystemStatusSnapshot,
  ctx: RenderContext,
  stats?: TranslationStats | null,
): string {
  const overallKey = snapshot.summary.overallStatus || "operational";
  const overallShort = overallShortLabel(overallKey);

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
      <a href="${escapeHtml(ctx.feedbackUrl)}" title="Feedback">Feedback</a>
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
