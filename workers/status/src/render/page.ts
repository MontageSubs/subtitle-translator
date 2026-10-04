import { SystemStatusSnapshot, StatusComponent, ComponentGroup, OverallStatus } from "../types";
import { formatUtcTimestamp } from "../timeFormat";
import { CLIENT_SCRIPT } from "./clientScript";
import { GROUP_ORDER, GROUP_TITLES, renderComponentCard } from "./components";
import { EXTERNAL_LINK_ICON, escapeHtml } from "./html";
import { renderIncidents } from "./incidents";
import { OVERALL_CONFIG, buildFaviconDataUri } from "./overall";
import { PAGE_STYLES } from "./styles";

export interface RenderContext {
  mainSiteUrl: string;
  issueReportUrl: string;
  githubRepoUrl: string;
  statusUrl: string;
  isMainSiteAvailable?: boolean;
}

const DEFAULT_MAIN_SITE_URL = "https://subs.js.org/subtitle-translator/";
const THIRD_PARTY_GROUPS: ComponentGroup[] = ["translation_engines", "infrastructure_dependencies"];

const stripTrailingSlashes = (url: string): string => url.replace(/\/+$/, "");

function groupComponents(snapshot: SystemStatusSnapshot): Map<ComponentGroup, StatusComponent[]> {
  const byGroup = new Map<ComponentGroup, StatusComponent[]>(GROUP_ORDER.map((group) => [group, []]));
  for (const component of snapshot.components) {
    const list = byGroup.get(component.group) || [];
    list.push(component);
    byGroup.set(component.group, list);
  }
  return byGroup;
}

function renderGroupCards(components: StatusComponent[], snapshot: SystemStatusSnapshot, nowMs: number): string {
  return components.map((c) => renderComponentCard(c, snapshot.incidents, nowMs)).join("");
}

function renderCoreSection(components: StatusComponent[], snapshot: SystemStatusSnapshot, nowMs: number): string {
  if (components.length === 0) return "";
  return `
      <section class="component-group" aria-labelledby="group-core_services">
        <h2 id="group-core_services" class="group-title">${escapeHtml(GROUP_TITLES.core_services)}</h2>
        <div class="group-cards">${renderGroupCards(components, snapshot, nowMs)}</div>
      </section>
    `;
}

function renderThirdPartyGroups(
  byGroup: Map<ComponentGroup, StatusComponent[]>,
  snapshot: SystemStatusSnapshot,
  nowMs: number,
): string {
  return THIRD_PARTY_GROUPS.map((groupKey) => {
    const components = byGroup.get(groupKey) || [];
    if (components.length === 0) return "";
    return `
      <section class="third-party-group" aria-labelledby="group-${groupKey}">
        <h3 id="group-${groupKey}" class="third-party-group-title">${escapeHtml(GROUP_TITLES[groupKey])}</h3>
        <div class="group-cards">${renderGroupCards(components, snapshot, nowMs)}</div>
      </section>
    `;
  }).join("");
}

function renderExternalLinks(snapshot: SystemStatusSnapshot): string {
  return snapshot.externalReferences
    .map(
      (ref) =>
        `<a class="ext-link" href="${escapeHtml(ref.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(ref.name)}" aria-label="${escapeHtml(ref.name)}">${escapeHtml(ref.name)}${EXTERNAL_LINK_ICON}</a>`,
    )
    .join("");
}

function resolveReportIssueLink(ctx: RenderContext, mainSiteBase: string): { href: string; targetAttrs: string } {
  if (ctx.isMainSiteAvailable === false) {
    return {
      href: `${stripTrailingSlashes(String(ctx.githubRepoUrl))}/issues`,
      targetAttrs: ` target="_blank" rel="noopener noreferrer"`,
    };
  }
  const isUsable =
    ctx.issueReportUrl &&
    ctx.issueReportUrl.startsWith("http") &&
    !ctx.issueReportUrl.includes(String(ctx.statusUrl).replace(/^https?:\/\//, ""));
  return { href: isUsable ? ctx.issueReportUrl : `${mainSiteBase}/docs/report-issue/`, targetAttrs: "" };
}

function renderHead(snapshot: SystemStatusSnapshot, ctx: RenderContext, overallKey: OverallStatus): string {
  const versionString = snapshot.meta.version || "1.0.0";
  const jsonLdData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Montage Subtitle Translator Status",
    "url": ctx.statusUrl,
    "description": "Automated health, uptime, and 90-day operational status monitor for Montage Subtitle Translator.",
    "inLanguage": "en",
    "isPartOf": {
      "@type": "WebSite",
      "name": "Montage Subtitle Translator",
      "url": ctx.mainSiteUrl,
    },
  });
  return `<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
  <meta charset="utf-8" />
  <script>document.documentElement.classList.replace('no-js','js');</script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="300" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <meta name="color-scheme" content="light dark" />
  <title>Montage Subtitle Translator Status</title>
  <meta name="description" content="Automated health, uptime, and 90-day operational status monitor for Montage Subtitle Translator." />
  <meta name="robots" content="index, follow" />
  <meta name="app-version" content="${escapeHtml(versionString)}" />
  <link rel="canonical" href="${escapeHtml(ctx.statusUrl)}" />
  <meta property="og:title" content="Montage Subtitle Translator Status" />
  <meta property="og:description" content="Automated operational health and incident tracker for Montage Subtitle Translator." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(ctx.statusUrl)}" />
  <meta property="og:site_name" content="Montage Subtitle Translator Status" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Montage Subtitle Translator Status" />
  <meta name="twitter:description" content="Automated health, uptime, and 90-day operational status monitor for Montage Subtitle Translator." />
  <link rel="icon" type="image/svg+xml" href="${buildFaviconDataUri(overallKey)}" />
  <script type="application/ld+json">${jsonLdData}</script>
  <style>
${PAGE_STYLES}  </style>
</head>
`;
}

function renderHeader(ctx: RenderContext, reportIssue: { href: string; targetAttrs: string }): string {
  const reportIssueLabel = "Report Issue";
  const reportIssueAria = `aria-label="Report an issue"`;
  const reportIssueTitle = "Report an issue";
  const reportIssueHref = reportIssue.href;
  const reportIssueTarget = reportIssue.targetAttrs;
  return `<body>
  <a href="#main-content" class="skip-link" title="Skip navigation and jump to main content">Skip to main content</a>
  <header class="site-header" role="banner">
    <div class="brand-group">
      <a class="brand-wrap" href="${escapeHtml(ctx.mainSiteUrl)}" title="Montage Subtitle Translator" aria-label="Montage Subtitle Translator Status">
        <span class="brand-title">Montage Subtitle Translator Status</span>
      </a>
      <span class="brand-sub">Service Availability &amp; Incident Monitoring</span>
    </div>
    <nav class="header-links" aria-label="Quick links">
      <span id="tz-control-wrap" class="js-only">
        <input type="checkbox" id="tz-state-checkbox" style="position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); border: 0;" aria-label="Time display preference" tabindex="-1" autocomplete="on">
        <button id="tz-toggle" type="button" aria-label="Current display: UTC time. Click to switch to local time" title="Click to switch to Local time">Time: UTC</button>
      </span>
      <a href="${escapeHtml(ctx.mainSiteUrl)}" title="Main App" aria-label="Main App">Main App</a>
      <a href="${escapeHtml(reportIssueHref)}"${reportIssueTarget} ${reportIssueAria} title="${escapeHtml(reportIssueTitle)}">${escapeHtml(reportIssueLabel)}</a>
    </nav>
  </header>

`;
}

function renderOverview(
  snapshot: SystemStatusSnapshot,
  overallKey: OverallStatus,
  coreSectionHtml: string,
): string {
  const overallCfg = OVERALL_CONFIG[overallKey] || OVERALL_CONFIG.operational;
  return `    <div class="core-services-container panel">
      <section class="status-banner banner-${escapeHtml(overallKey)}" role="status" aria-live="polite">
        <div class="status-banner-icon">${overallCfg.icon}</div>
        <div class="status-banner-content">
          <h1>${escapeHtml(overallCfg.title)}</h1>
          <p>${escapeHtml(overallCfg.subtitle)}</p>
          ${overallKey !== "operational" ? `<a href="#incidents-title" style="color: inherit; text-decoration: underline; font-size: 0.875rem; margin-top: 0.5rem; display: inline-block;">View active incidents &darr;</a>` : ""}
        </div>
      </section>

      <section class="kpi-grid" aria-label="Key operational metrics">
        <div class="kpi-card">
          <div class="kpi-label" id="kpi-90d-label">Rolling ${snapshot.summary.rollingDays}-Day Uptime</div>
          <div class="kpi-value" aria-labelledby="kpi-90d-label">${snapshot.summary.rolling90dRatio.toFixed(2)}%</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" id="kpi-24h-label">24-Hour Availability</div>
          <div class="kpi-value" aria-labelledby="kpi-24h-label">${snapshot.summary.past24hAvailability.toFixed(1)}%</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" id="kpi-incidents-label">Active Incidents</div>
          <div class="kpi-value" aria-labelledby="kpi-incidents-label">${snapshot.summary.activeIncidentsCount}</div>
        </div>
      </section>

      <section class="legend" aria-labelledby="legend-title">
        <h2 id="legend-title" class="sr-only">Status color legend</h2>
        <ul class="legend-list">
          <li class="legend-item"><span class="legend-swatch bar-emerald" aria-hidden="true"></span>Operational &mdash; running normally</li>
          <li class="legend-item"><span class="legend-swatch bar-amber" aria-hidden="true"></span>Degraded &mdash; reduced uptime that day</li>
          <li class="legend-item"><span class="legend-swatch bar-red" aria-hidden="true"></span>Major Outage &mdash; service unavailable</li>
          <li class="legend-item"><span class="legend-swatch bar-slate" aria-hidden="true"></span>No Data &mdash; before monitoring began</li>
          <li class="legend-item"><span class="legend-swatch banner-maintenance" aria-hidden="true"></span>Maintenance &mdash; shown at the top during planned work</li>
        </ul>
      </section>

      ${coreSectionHtml}
    </div>

`;
}

function renderBackLink(ctx: RenderContext): string {
  return `    <a class="back-to-app" href="${escapeHtml(ctx.mainSiteUrl)}" title="Back to Main App">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      <span>Back to Main App</span>
    </a>
  </main>

`;
}

function renderThirdPartySection(thirdPartyGroupsHtml: string, externalLinksHtml: string): string {
  return `    ${thirdPartyGroupsHtml || externalLinksHtml ? `
      <section class="third-party-container panel" aria-labelledby="third-party-main-title">
        <h2 id="third-party-main-title" class="panel-title">Third-Party Services Status</h2>
        ${thirdPartyGroupsHtml}
        ${externalLinksHtml ? `
        <section class="third-party-group" aria-labelledby="eco-title">
          <h3 id="eco-title" class="third-party-group-title">Third-Party Status Pages</h3>
          <div class="ecosystem-links">${externalLinksHtml}</div>
        </section>
        ` : ""}
      </section>
    ` : ""}

`;
}

function renderFooter(snapshot: SystemStatusSnapshot, ctx: RenderContext, mainSiteBase: string): string {
  const generatedDate = snapshot.meta.generatedAt ? new Date(snapshot.meta.generatedAt) : new Date();
  const currentYear = isNaN(generatedDate.getTime()) ? new Date().getUTCFullYear() : generatedDate.getUTCFullYear();
  return `  <footer class="site-footer" role="contentinfo">
    <div class="footer-primary">
      <div class="footer-brand-block">
        <div class="footer-brand-title">Montage Subtitle Translator Status</div>
        <div class="footer-brand-desc">Service health and operational status.</div>
      </div>
      <nav class="footer-nav" aria-label="Status page resources">
        <a class="footer-nav-item" href="${escapeHtml(ctx.statusUrl)}/status.json" target="_blank" rel="noopener noreferrer" title="Status API" aria-label="Status API"><svg class="icon-sub" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>Status API</a>
        <a class="footer-nav-item" href="${escapeHtml(ctx.statusUrl)}/badge.svg" target="_blank" rel="noopener noreferrer" title="Status Badge" aria-label="Status Badge"><svg class="icon-sub" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>Status Badge</a>
        <a class="footer-nav-item" href="${escapeHtml(ctx.githubRepoUrl)}" target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="GitHub"><svg class="icon-sub" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>GitHub</a>
        <a class="footer-nav-item" href="${escapeHtml(mainSiteBase)}/docs/terms/" target="_blank" rel="noopener noreferrer" title="Terms of Service" aria-label="Terms of Service">Terms</a>
        <a class="footer-nav-item" href="${escapeHtml(mainSiteBase)}/docs/privacy/" target="_blank" rel="noopener noreferrer" title="Privacy Policy" aria-label="Privacy Policy">Privacy</a>
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
`;
}

export function renderStatusHtml(snapshot: SystemStatusSnapshot, ctx: RenderContext): string {
  const nowMs = Date.parse(snapshot.meta.generatedAt) || Date.now();
  const overallKey = snapshot.summary.overallStatus || "operational";
  const mainSiteBase = stripTrailingSlashes(String(ctx.mainSiteUrl || DEFAULT_MAIN_SITE_URL));
  const byGroup = groupComponents(snapshot);

  const coreSectionHtml = renderCoreSection(byGroup.get("core_services") || [], snapshot, nowMs);
  const thirdPartyGroupsHtml = renderThirdPartyGroups(byGroup, snapshot, nowMs);
  const externalLinksHtml = renderExternalLinks(snapshot);

  return [
    renderHead(snapshot, ctx, overallKey),
    renderHeader(ctx, resolveReportIssueLink(ctx, mainSiteBase)),
    `  <main id="main-content" class="layout-container" role="main">\n`,
    renderOverview(snapshot, overallKey, coreSectionHtml),
    renderThirdPartySection(thirdPartyGroupsHtml, externalLinksHtml),
    `    ${renderIncidents(snapshot.incidents, snapshot.meta.retentionDays, nowMs)}\n\n`,
    renderBackLink(ctx),
    renderFooter(snapshot, ctx, mainSiteBase),
    `  <script>\n${CLIENT_SCRIPT}  </script>\n</body>\n</html>`,
  ].join("");
}
