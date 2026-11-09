import { SystemStatusSnapshot, StatusComponent, ComponentGroup, OverallStatus } from "../types";
import { DEFAULT_MAIN_SITE_URL, stripTrailingSlashes } from "../config";
import { CLIENT_SCRIPT } from "./clientScript";
import { GROUP_ORDER, GROUP_TITLES, renderComponentCard } from "./components";
import { renderSiteFooter } from "./footer";
import { escapeHtml, externalLink, jsonLdScript } from "./html";
import { renderIncidents } from "./incidents";
import { OVERALL_CONFIG, buildFaviconDataUri } from "./overall";
import { PAGE_STYLES } from "./styles";

export interface RenderContext {
  mainSiteUrl: string;
  feedbackUrl: string;
  githubRepoUrl: string;
  statusUrl: string;
  isMainSiteAvailable?: boolean;
}

const THIRD_PARTY_GROUPS: ComponentGroup[] = ["translation_engines", "infrastructure_dependencies"];

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
  return snapshot.externalReferences.map((ref) => externalLink(ref.url, ref.name, { className: "ext-link" })).join("");
}

function resolveReportIssueHref(ctx: RenderContext, mainSiteBase: string): string {
  if (ctx.isMainSiteAvailable === false) return `${stripTrailingSlashes(String(ctx.githubRepoUrl))}/issues`;
  const isUsable =
    ctx.feedbackUrl &&
    ctx.feedbackUrl.startsWith("http") &&
    !ctx.feedbackUrl.includes(String(ctx.statusUrl).replace(/^https?:\/\//, ""));
  return isUsable ? ctx.feedbackUrl : `${mainSiteBase}/docs/feedback/`;
}

function renderHead(snapshot: SystemStatusSnapshot, ctx: RenderContext, overallKey: OverallStatus): string {
  const versionString = snapshot.meta.version;
  const jsonLd = jsonLdScript({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Montage Subtitle Translator Status",
    url: ctx.statusUrl,
    description: "Automated health, uptime, and 90-day operational status monitor for Montage Subtitle Translator.",
    inLanguage: "en",
    dateModified: snapshot.meta.generatedAt,
    isPartOf: { "@type": "WebSite", name: "Montage Subtitle Translator", url: ctx.mainSiteUrl },
    publisher: { "@type": "Organization", name: "MontageSubs", sameAs: [ctx.githubRepoUrl] },
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
  <meta property="og:locale" content="en_US" />
  <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Montage Subtitle Translator Status" />
  <meta name="twitter:description" content="Automated health, uptime, and 90-day operational status monitor for Montage Subtitle Translator." />
  <link rel="icon" type="image/svg+xml" href="${buildFaviconDataUri(overallKey)}" />
  ${jsonLd}
  <style>
${PAGE_STYLES}  </style>
</head>
`;
}

function renderHeader(ctx: RenderContext, feedbackHref: string): string {
  return `<body>
  <a href="#main-content" class="skip-link" title="Skip navigation and jump to main content">Skip to main content</a>
  <header class="site-header" role="banner">
    <div class="brand-group">
      <a class="brand-wrap" href="/" title="Montage Subtitle Translator Status" aria-label="Montage Subtitle Translator Status">
        <span class="brand-title">Montage Subtitle Translator Status</span>
      </a>
      <span class="brand-sub">Service Availability &amp; Incident Monitoring</span>
    </div>
    <nav class="header-links" aria-label="Quick links">
      <span id="tz-control-wrap" class="js-only">
        <input type="checkbox" id="tz-state-checkbox" style="position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); border: 0;" aria-label="Time display preference" tabindex="-1" autocomplete="on">
        <button id="tz-toggle" type="button" aria-label="Current display: UTC time. Click to switch to local time" title="Click to switch to Local time">Time: UTC</button>
      </span>
      ${externalLink(ctx.mainSiteUrl, "Main App")}
      ${externalLink(feedbackHref, "Feedback")}
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
    renderHeader(ctx, resolveReportIssueHref(ctx, mainSiteBase)),
    `  <main id="main-content" class="layout-container" role="main">\n`,
    renderOverview(snapshot, overallKey, coreSectionHtml),
    renderThirdPartySection(thirdPartyGroupsHtml, externalLinksHtml),
    `    ${renderIncidents(snapshot.incidents, snapshot.meta.retentionDays, nowMs)}\n\n`,
    renderBackLink(ctx),
    renderSiteFooter(snapshot, {
      statusBase: stripTrailingSlashes(ctx.statusUrl),
      mainSiteBase,
      githubRepoUrl: ctx.githubRepoUrl,
      includeBadgesLink: true,
    }),
    `  <script>\n${CLIENT_SCRIPT}  </script>\n</body>\n</html>`,
  ].join("");
}
