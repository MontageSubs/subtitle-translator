import { OverallStatus, SystemStatusSnapshot, TranslationStats } from "../types";
import {
  formatCompactMetric,
  renderDayTranslationsBadge,
  renderServiceStatusBadge,
  renderTotalTranslationsBadge,
  renderUptimeBadge,
} from "./badge";
import { stripTrailingSlashes } from "../config";
import { BADGE_ASSET_PATHS } from "../publish/paths";
import { renderSiteFooter } from "./footer";
import { EXTERNAL_LINK_ICON, escapeHtml, externalLink, jsonLdScript } from "./html";
import { buildFaviconDataUri } from "./overall";
import { RenderContext } from "./page";
import { BADGES_CLIENT_SCRIPT } from "./badgesClientScript";
import { BADGES_PAGE_STYLES } from "./badgesStyles";

const BADGES_PAGE_TITLE = "Status Badges | Montage Subtitle Translator";
const BADGES_PAGE_DESCRIPTION = "Embeddable live SVG status badges for Montage Subtitle Translator services and metrics.";

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
      badgePath: BADGE_ASSET_PATHS.service,
      badgeSvg: renderServiceStatusBadge(overallStatus),
      currentValue: overallShort,
      statusClass: `dot-${overallStatus}`,
    },
    {
      id: "rolling-uptime",
      name: "Rolling 90-Day Uptime",
      description: "Continuous availability percentage over the rolling 90-day monitoring window",
      badgePath: BADGE_ASSET_PATHS.uptime,
      badgeSvg: renderUptimeBadge(snapshot.summary.rolling90dRatio),
      currentValue: `${snapshot.summary.rolling90dRatio.toFixed(2)}%`,
      statusClass: "dot-operational",
    },
    {
      id: "translations-total",
      name: "Total Translations",
      description: "Cumulative count of successfully translated subtitle files and tasks",
      badgePath: BADGE_ASSET_PATHS.totalTranslations,
      badgeSvg: renderTotalTranslationsBadge(stats?.total ?? 0),
      currentValue: `${formatCompactMetric(stats?.total ?? 0)} total`,
      statusClass: "dot-operational",
    },
    {
      id: "translations-24h",
      name: "Past 24-Hour Translations",
      description: "Number of subtitle translation jobs processed during the last 24 hours",
      badgePath: BADGE_ASSET_PATHS.dayTranslations,
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
          ${EXTERNAL_LINK_ICON}
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

  const statusBase = stripTrailingSlashes(ctx.statusUrl);
  const mainSiteBase = stripTrailingSlashes(ctx.mainSiteUrl);
  const badgeItems = buildBadgesList(snapshot, stats);
  const totalBadges = badgeItems.length;

  const structuredData = jsonLdScript({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: BADGES_PAGE_TITLE,
    url: `${statusBase}/badges/`,
    description: BADGES_PAGE_DESCRIPTION,
    inLanguage: "en",
    dateModified: snapshot.meta.generatedAt,
    isPartOf: { "@type": "WebSite", name: "Montage Subtitle Translator Status", url: `${statusBase}/` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Status", item: `${statusBase}/` },
        { "@type": "ListItem", position: 2, name: "Status Badges", item: `${statusBase}/badges/` },
      ],
    },
  });

  const cardsHtml = badgeItems.map((item) => renderBadgeCard(item, statusBase)).join("");

  return `<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
  <meta charset="utf-8" />
  <script>document.documentElement.classList.replace('no-js','js');</script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta name="color-scheme" content="light dark" />
  <title>${BADGES_PAGE_TITLE}</title>
  <meta name="description" content="${BADGES_PAGE_DESCRIPTION}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${escapeHtml(statusBase)}/badges/" />
  <meta property="og:title" content="${BADGES_PAGE_TITLE}" />
  <meta property="og:description" content="${BADGES_PAGE_DESCRIPTION}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(statusBase)}/badges/" />
  <meta property="og:site_name" content="Montage Subtitle Translator Status" />
  <meta property="og:locale" content="en_US" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${BADGES_PAGE_TITLE}" />
  <meta name="twitter:description" content="${BADGES_PAGE_DESCRIPTION}" />
  <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
  ${structuredData}
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
      ${externalLink(ctx.mainSiteUrl, "Main App")}
      ${externalLink(ctx.feedbackUrl, "Feedback")}
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

  ${renderSiteFooter(snapshot, { statusBase, mainSiteBase, githubRepoUrl: ctx.githubRepoUrl, includeBadgesLink: false })}
  <script>
${BADGES_CLIENT_SCRIPT}
  </script>
</body>
</html>`;
}
