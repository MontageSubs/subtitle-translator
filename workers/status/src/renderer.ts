import {
  SystemStatusSnapshot,
  StatusComponent,
  Incident,
  OverallStatus,
  ComponentStatus,
  ComponentGroup,
} from "./types";

export interface RenderContext {
  mainSiteUrl: string;
  issueReportUrl: string;
  githubRepoUrl: string;
  statusUrl: string;
  isMainSiteAvailable?: boolean;
}

function escapeHtml(text?: string): string {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatUtcTimestamp(dateInput: Date | string | number): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  return `Updated ${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

const GROUP_TITLES: Record<ComponentGroup, string> = {
  core_services: "Core System & Services",
  translation_engines: "Translation Providers",
  infrastructure_dependencies: "Infrastructure & Dependencies",
};

const GROUP_ORDER: ComponentGroup[] = [
  "core_services",
  "translation_engines",
  "infrastructure_dependencies",
];

const STATUS_TEXT: Record<ComponentStatus, string> = {
  operational: "Operational",
  degraded_performance: "Degraded Performance",
  partial_outage: "Partial Outage",
  major_outage: "Major Outage",
  no_data: "No Data Available",
};

const OVERALL_CONFIG: Record<
  OverallStatus,
  { title: string; subtitle: string; icon: string }
> = {
  operational: {
    title: "All Systems Operational",
    subtitle:
      "All core translation pipelines, edge gateways, and upstream models are operating nominally.",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6L9 17l-5-5"/></svg>`,
  },
  degraded: {
    title: "Partially Degraded Performance",
    subtitle:
      "One or more translation channels or external providers are experiencing latency or failover.",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  },
  major_outage: {
    title: "Major System Outage",
    subtitle:
      "A critical core service or multiple primary translation providers are currently unavailable.",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  },
  maintenance: {
    title: "Under Scheduled Maintenance",
    subtitle:
      "Routine infrastructure upgrades or database index optimizations are actively underway.",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>`,
  },
};

function renderStatusBadge(status: ComponentStatus): string {
  const text = STATUS_TEXT[status] || "Operational";
  let colorClass = "badge-operational";
  if (status === "degraded_performance") colorClass = "badge-degraded";
  else if (status === "partial_outage") colorClass = "badge-partial";
  else if (status === "major_outage") colorClass = "badge-outage";
  else if (status === "no_data") colorClass = "badge-nodata";

  return `<span class="badge ${colorClass}" role="status" aria-label="Status: ${escapeHtml(text)}">${escapeHtml(text)}</span>`;
}

function renderBarMatrix(component: StatusComponent): string {
  const history = component.history90d || [];
  const barsHtml = history
    .map((cell) => {
      let colorClass = "bar-emerald";
      let tooltipDesc = "100.0% operational";
      if (cell.status === "nodata" || cell.uptime === null) {
        colorClass = "bar-slate";
        tooltipDesc = "No data recorded";
      } else if (cell.status === "outage" || cell.uptime < 90.0) {
        colorClass = "bar-red";
        tooltipDesc = `${cell.uptime.toFixed(1)}% - Major outage recorded`;
      } else if (cell.status === "degraded" || cell.uptime < 100.0) {
        colorClass = cell.uptime < 98.0 ? "bar-orange" : "bar-amber";
        tooltipDesc = `${cell.uptime.toFixed(1)}% - Degraded performance observed`;
      }

      const accessibleText = `${cell.date}: ${tooltipDesc}`;
      return `<div class="day-bar ${colorClass}" title="${escapeHtml(accessibleText)}" role="button" tabindex="0" aria-label="${escapeHtml(accessibleText)}"></div>`;
    })
    .join("");

  const uptimeLabel =
    component.uptime90d >= 0
      ? `${component.uptime90d.toFixed(2)}% uptime`
      : "N/A";
  const srSummary =
    component.uptime90d >= 0
      ? `90-day historical uptime: ${component.uptime90d.toFixed(2)} percent.`
      : "90-day history not yet available.";

  return `
    <div class="matrix-wrap" aria-label="90-day daily uptime history for ${escapeHtml(component.name)}">
      <span class="sr-only">${escapeHtml(srSummary)}</span>
      <div class="bars-row" role="region" aria-label="Daily uptime timeline">${barsHtml}</div>
      <div class="matrix-legend" aria-hidden="true">
        <span>90 days ago</span>
        <span class="matrix-uptime">${uptimeLabel}</span>
        <span>Today</span>
      </div>
    </div>
  `;
}

function renderComponentCard(component: StatusComponent, incidents: Incident[]): string {
  const activeIncident = incidents.find(i => {
    if (Array.isArray(i.componentId)) {
      return i.componentId.includes(component.id) && i.status !== "resolved";
    }
    return i.componentId === component.id && i.status !== "resolved";
  });
  const badgeHtml = renderStatusBadge(component.status);
  const statusWrap = activeIncident 
    ? `<a href="#${escapeHtml(activeIncident.id)}" class="incident-link" style="text-decoration:none;" title="View related incident">${badgeHtml}</a>`
    : badgeHtml;

  return `
    <article class="component-card" id="comp-${escapeHtml(component.id)}" aria-labelledby="comp-title-${escapeHtml(component.id)}">
      <div class="component-header">
        <h3 id="comp-title-${escapeHtml(component.id)}" class="component-name">${escapeHtml(component.name)}</h3>
        <div class="component-status-wrap">
          ${statusWrap}
        </div>
      </div>
      ${renderBarMatrix(component)}
    </article>
  `;
}

function renderIncidents(incidents: Incident[]): string {
  if (!incidents || incidents.length === 0) {
    return `
      <section class="incidents-section" aria-labelledby="incidents-title">
        <h2 id="incidents-title" class="section-title">Past Incidents &amp; Maintenance</h2>
        <div class="empty-incidents" role="status">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span>No incidents or maintenance reported in the past 90 days. All systems operating nominally.</span>
        </div>
      </section>
    `;
  }

  const activeIncidents = incidents.filter(i => i.status !== "resolved");
  const resolvedIncidents = incidents.filter(i => i.status === "resolved").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const sortedIncidents = [...activeIncidents, ...resolvedIncidents];

  const itemsHtml = sortedIncidents
    .map((inc, index) => {
      const updatesHtml = inc.updates
        .map(
          (u) => `
        <li class="incident-update-item">
          <div class="update-meta">
            <span class="update-stage stage-${escapeHtml(u.status)}" aria-label="Stage: ${escapeHtml(u.status)}">${escapeHtml(u.status.toUpperCase())}</span>
            <time class="update-time" datetime="${escapeHtml(u.timestamp)}">${escapeHtml(new Date(u.timestamp).toUTCString())}</time>
          </div>
          <div class="update-body">${escapeHtml(u.body)}</div>
        </li>
      `,
        )
        .join("");

      const hiddenAttr = index >= 5 ? ' style="display: none;" class="incident-item hidden-incident"' : ' class="incident-item"';
      const isOpen = inc.status !== "resolved" ? "open" : "";

      return `
      <details${hiddenAttr} id="${escapeHtml(inc.id)}" ${isOpen}>
        <summary class="incident-summary" aria-label="Incident: ${escapeHtml(inc.title)}, Severity: ${escapeHtml(inc.severity)}, Status: ${escapeHtml(inc.status)}" onclick="var e = arguments[0] || window.event; if(window.getSelection().toString()) e.preventDefault();">
          <div class="incident-title-wrap" style="user-select: text;">
            <span class="incident-severity severity-${escapeHtml(inc.severity)}" aria-label="Severity: ${escapeHtml(inc.severity)}">${escapeHtml(inc.severity.toUpperCase())}</span>
            <span class="incident-title">${escapeHtml(inc.title)}</span>
            <a href="#${escapeHtml(inc.id)}" class="incident-link-icon" style="color: #9ca3af; text-decoration: none; margin-left: 0.5rem;" title="Permalink" onclick="var e = arguments[0] || window.event; e.stopPropagation();">#</a>
          </div>
          <span class="incident-state state-${escapeHtml(inc.status)}" aria-label="Status: ${escapeHtml(inc.status)}">${escapeHtml(inc.status.toUpperCase())}</span>
        </summary>
        <ul class="incident-timeline" aria-label="Timeline of updates for ${escapeHtml(inc.title)}">
          ${updatesHtml}
        </ul>
      </details>
    `;
    })
    .join("");

  let moreButtonHtml = "";
  if (sortedIncidents.length > 5) {
    moreButtonHtml = `
      <div style="text-align: center; margin-top: 1rem;">
        <button id="show-more-incidents" style="background: var(--bg-card); border: 1px solid var(--border-subtle); padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; color: var(--text-primary); font-size: 0.875rem;">Show More Past Incidents</button>
      </div>
      <script>
        document.getElementById('show-more-incidents')?.addEventListener('click', function(e) {
          document.querySelectorAll('.hidden-incident').forEach(function(el) {
            el.style.display = 'block';
          });
          e.target.style.display = 'none';
        });
      </script>
    `;
  }

  return `
    <section class="incidents-section" aria-labelledby="incidents-title">
      <h2 id="incidents-title" class="section-title">Past Incidents &amp; Maintenance</h2>
      <div class="incidents-list">${itemsHtml}</div>
      ${moreButtonHtml}
    </section>
  `;
}

export function renderStatusHtml(
  snapshot: SystemStatusSnapshot,
  ctx: RenderContext,
): string {
  const overallKey = snapshot.summary.overallStatus || "operational";
  const overallCfg = OVERALL_CONFIG[overallKey] || OVERALL_CONFIG.operational;
  const componentsByGroup = new Map<ComponentGroup, StatusComponent[]>();

  for (const group of GROUP_ORDER) {
    componentsByGroup.set(group, []);
  }

  for (const comp of snapshot.components) {
    const list = componentsByGroup.get(comp.group) || [];
    list.push(comp);
    componentsByGroup.set(comp.group, list);
  }

  const groupsHtml = GROUP_ORDER.map((groupKey) => {
    const comps = componentsByGroup.get(groupKey) || [];
    if (comps.length === 0) return "";
    const title = GROUP_TITLES[groupKey];
    const cards = comps.map(c => renderComponentCard(c, snapshot.incidents)).join("");
    return `
      <section class="component-group" aria-labelledby="group-${groupKey}">
        <h2 id="group-${groupKey}" class="group-title">${escapeHtml(title)}</h2>
        <div class="group-cards">${cards}</div>
      </section>
    `;
  }).join("");

  const externalLinksHtml = snapshot.externalReferences
    .map(
      (ref) =>
        `<a class="ext-link" href="${escapeHtml(ref.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(ref.name)} status page (opens in a new tab)">${escapeHtml(ref.name)} &nearr;</a>`,
    )
    .join("");

  const isFrontendAvailable = ctx.isMainSiteAvailable !== false;
  const repoBase = String(ctx.githubRepoUrl).replace(/\/+$/, "");
  const fallbackGithubIssuesUrl = `${repoBase}/issues`;
  const mainSiteBase = String(
    ctx.mainSiteUrl || "https://subs.js.org/subtitle-translator/",
  ).replace(/\/+$/, "");
  const primaryDocReportUrl =
    ctx.issueReportUrl &&
    ctx.issueReportUrl.startsWith("http") &&
    !ctx.issueReportUrl.includes(String(ctx.statusUrl).replace(/^https?:\/\//, ""))
      ? ctx.issueReportUrl
      : `${mainSiteBase}/docs/report-issue/`;

  const reportIssueHref = isFrontendAvailable
    ? primaryDocReportUrl
    : fallbackGithubIssuesUrl;
  const reportIssueLabel = isFrontendAvailable
    ? "Report Issue"
    : "Report Issue (GitHub)";
  const reportIssueTarget = isFrontendAvailable
    ? ""
    : ` target="_blank" rel="noopener noreferrer"`;
  const reportIssueAria = isFrontendAvailable
    ? `aria-label="Report an issue on documentation center"`
    : `aria-label="Report an issue directly on GitHub repository (opens in a new tab)"`;

  const generatedDate = snapshot.meta.generatedAt
    ? new Date(snapshot.meta.generatedAt)
    : new Date();
  const currentYear = isNaN(generatedDate.getTime())
    ? new Date().getUTCFullYear()
    : generatedDate.getUTCFullYear();
  const versionString = snapshot.meta.version || "1.0.0";

  const jsonLdData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Montage Subtitle Translator Status",
    "url": ctx.statusUrl,
    "description": "Official real-time health, uptime, and 90-day operational status monitor for Montage Subtitle Translator.",
    "inLanguage": "en",
    "isPartOf": {
      "@type": "WebSite",
      "name": "Montage Subtitle Translator",
      "url": ctx.mainSiteUrl,
    },
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <title>Montage Subtitle Translator Status</title>
  <meta name="description" content="Official real-time health, uptime, and 90-day operational status monitor for Montage Subtitle Translator." />
  <meta name="robots" content="index, follow" />
  <meta name="app-version" content="${escapeHtml(versionString)}" />
  <link rel="canonical" href="${escapeHtml(ctx.statusUrl)}" />
  <meta property="og:title" content="Montage Subtitle Translator Status" />
  <meta property="og:description" content="Live operational health and incident tracker for Montage Subtitle Translator." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(ctx.statusUrl)}" />
  <meta property="og:site_name" content="Montage Subtitle Translator Status" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Montage Subtitle Translator Status" />
  <meta name="twitter:description" content="Official real-time health, uptime, and 90-day operational status monitor for Montage Subtitle Translator." />
  <link rel="icon" type="image/svg+xml" href="${escapeHtml(ctx.mainSiteUrl)}favicon.svg" />
  <script type="application/ld+json">${jsonLdData}</script>
  <style>
    :root {
      --bg-page: #f8fafc;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #64748b;
      --border-subtle: #e2e8f0;
      --border-strong: #cbd5e1;
      --bg-card: #ffffff;
      --bg-subtle: #f1f5f9;
      --bg-summary: #f8fafc;
      --link-color: #1d4ed8;
      --link-hover: #1e40af;
      --link-ext-bg: #f1f5f9;
      --link-ext-hover: #e2e8f0;
      --focus-ring: #2563eb;

      --green-banner-bg: #059669;
      --green-banner-border: #047857;
      --green-bar: #10b981;
      --green-badge-text: #065f46;
      --green-badge-bg: #d1fae5;
      --green-badge-border: #6ee7b7;

      --amber-banner-bg: #d97706;
      --amber-banner-border: #b45309;
      --amber-bar: #f59e0b;
      --amber-badge-text: #78350f;
      --amber-badge-bg: #fef3c7;
      --amber-badge-border: #fcd34d;

      --orange-bar: #f97316;
      --orange-badge-text: #7c2d12;
      --orange-badge-bg: #ffedd5;
      --orange-badge-border: #fed7aa;

      --red-banner-bg: #dc2626;
      --red-banner-border: #b91c1c;
      --red-bar: #ef4444;
      --red-badge-text: #7f1d1d;
      --red-badge-bg: #fee2e2;
      --red-badge-border: #fca5a5;

      --blue-banner-bg: #2563eb;
      --blue-banner-border: #1d4ed8;

      --slate-bar: #cbd5e1;
      --slate-badge-text: #334155;
      --slate-badge-bg: #f1f5f9;
      --slate-badge-border: #cbd5e1;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-page: #0b0f19;
        --text-primary: #f8fafc;
        --text-secondary: #94a3b8;
        --text-muted: #64748b;
        --border-subtle: #1e293b;
        --border-strong: #334155;
        --bg-card: #131b2e;
        --bg-subtle: #1e293b;
        --bg-summary: #0f172a;
        --link-color: #60a5fa;
        --link-hover: #93c5fd;
        --link-ext-bg: #1e293b;
        --link-ext-hover: #334155;
        --focus-ring: #60a5fa;

        --green-banner-bg: #065f46;
        --green-banner-border: #10b981;
        --green-bar: #34d399;
        --green-badge-text: #34d399;
        --green-badge-bg: #064e3b;
        --green-badge-border: #059669;

        --amber-banner-bg: #78350f;
        --amber-banner-border: #f59e0b;
        --amber-bar: #fbbf24;
        --amber-badge-text: #fbbf24;
        --amber-badge-bg: #451a03;
        --amber-badge-border: #78350f;

        --orange-bar: #fb923c;
        --orange-badge-text: #fdba74;
        --orange-badge-bg: #431407;
        --orange-badge-border: #9a3412;

        --red-banner-bg: #7f1d1d;
        --red-banner-border: #ef4444;
        --red-bar: #f87171;
        --red-badge-text: #fca5a5;
        --red-badge-bg: #450a0a;
        --red-badge-border: #991b1b;

        --blue-banner-bg: #1e3a8a;
        --blue-banner-border: #3b82f6;

        --slate-bar: #334155;
        --slate-badge-text: #94a3b8;
        --slate-badge-bg: #1e293b;
        --slate-badge-border: #334155;
      }
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html {
      background-color: var(--bg-page);
      color-scheme: light dark;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-page);
      color: var(--text-primary);
      line-height: 1.6;
      font-size: 16px;
      -webkit-font-smoothing: antialiased;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      transition: background-color 0.2s ease, color 0.2s ease;
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
    a:focus-visible, button:focus-visible, summary:focus-visible, [tabindex="0"]:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 3px;
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
      padding: 0.25rem 0.375rem;
      border-radius: 6px;
      transition: color 0.15s ease;
      line-height: 1.3;
    }
    .header-links a:hover {
      color: var(--text-primary);
      text-decoration: none;
    }
    .header-links a:focus-visible {
      outline: 2px solid var(--link-color);
      color: var(--link-hover);
    }
    .status-banner {
      border-radius: 10px;
      padding: 1.25rem 1.5rem;
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      color: #ffffff;
      border-width: 1px;
      border-style: solid;
    }
    .banner-operational {
      background-color: var(--green-banner-bg);
      border-color: var(--green-banner-border);
    }
    .banner-degraded {
      background-color: var(--amber-banner-bg);
      border-color: var(--amber-banner-border);
    }
    .banner-major_outage {
      background-color: var(--red-banner-bg);
      border-color: var(--red-banner-border);
    }
    .banner-maintenance {
      background-color: var(--blue-banner-bg);
      border-color: var(--blue-banner-border);
    }
    .status-banner-icon {
      flex-shrink: 0;
      margin-top: 0.125rem;
    }
    .status-banner-content h1 {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      margin-bottom: 0.25rem;
    }
    .status-banner-content p {
      font-size: 0.9375rem;
      opacity: 0.95;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .kpi-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1.25rem;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .kpi-label {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: 700;
      margin-bottom: 0.375rem;
    }
    .kpi-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }
    .section-title, .group-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 2rem 0 1rem 0;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .group-cards {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }
    .component-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1.125rem 1.25rem;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .component-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.875rem;
    }
    .component-name {
      font-size: 0.9375rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      white-space: nowrap;
      border-width: 1px;
      border-style: solid;
    }
    .badge-operational { color: var(--green-badge-text); background: var(--green-badge-bg); border-color: var(--green-badge-border); }
    .badge-degraded { color: var(--amber-badge-text); background: var(--amber-badge-bg); border-color: var(--amber-badge-border); }
    .badge-partial { color: var(--orange-badge-text); background: var(--orange-badge-bg); border-color: var(--orange-badge-border); }
    .badge-outage { color: var(--red-badge-text); background: var(--red-badge-bg); border-color: var(--red-badge-border); }
    .badge-nodata { color: var(--slate-badge-text); background: var(--slate-badge-bg); border-color: var(--slate-badge-border); }

    .matrix-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .bars-row {
      display: grid;
      grid-template-columns: repeat(90, 1fr);
      gap: 2px;
      height: 24px;
      align-items: stretch;
    }
    .day-bar {
      border-radius: 2px;
      min-width: 0;
      transition: opacity 0.1s ease, transform 0.1s ease;
      cursor: pointer;
    }
    .day-bar:hover, .day-bar:focus-visible {
      opacity: 0.85;
      transform: scaleY(1.18);
    }
    .bar-emerald { background-color: var(--green-bar); }
    .bar-amber { background-color: var(--amber-bar); }
    .bar-orange { background-color: var(--orange-bar); }
    .bar-red { background-color: var(--red-bar); }
    .bar-slate { background-color: var(--slate-bar); }

    .matrix-legend {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #9ca3af;
      margin-top: 0.125rem;
    }
    .matrix-uptime {
      font-weight: 700;
      color: var(--text-secondary);
    }
    .empty-incidents {
      background: var(--bg-card);
      border: 1px dashed var(--border-strong);
      border-radius: 8px;
      padding: 1.5rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .incidents-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    details.incident-item {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }
    summary.incident-summary {
      padding: 1rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      font-weight: 600;
      background: var(--bg-summary);
      border-bottom: 1px solid transparent;
      user-select: none;
      min-height: 48px;
    }
    details.incident-item[open] summary.incident-summary {
      border-bottom-color: var(--border-subtle);
    }
    .incident-title-wrap {
      display: flex;
      align-items: center;
      gap: 0.625rem;
    }
    .incident-severity {
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      border-width: 1px;
      border-style: solid;
    }
    .severity-minor { background: var(--amber-badge-bg); color: var(--amber-badge-text); border-color: var(--amber-badge-border); }
    .severity-major { background: var(--red-badge-bg); color: var(--red-badge-text); border-color: var(--red-badge-border); }
    .severity-critical { background: #7f1d1d; color: #ffffff; border-color: #ef4444; }
    .incident-state {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-secondary);
    }
    .incident-timeline {
      list-style: none;
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }
    .incident-update-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      border-left: 3px solid var(--border-strong);
      padding-left: 0.875rem;
    }
    .update-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .update-stage {
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
    }
    .stage-investigating { background: var(--amber-badge-bg); color: var(--amber-badge-text); }
    .stage-identified { background: var(--red-badge-bg); color: var(--red-badge-text); }
    .stage-monitoring { background: var(--bg-subtle); color: var(--link-color); }
    .stage-resolved { background: var(--green-badge-bg); color: var(--green-badge-text); }
    .update-time {
      font-size: 0.75rem;
      color: #9ca3af;
    }
    .update-body {
      font-size: 0.875rem;
      color: var(--text-primary);
    }
    .ecosystem-section {
      margin-top: 2.5rem;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1.25rem;
    }
    .ecosystem-title {
      font-size: 0.9375rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      color: var(--text-primary);
    }
    .ecosystem-links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.875rem;
    }
    .ext-link {
      font-size: 0.8125rem;
      color: var(--link-color);
      text-decoration: none;
      font-weight: 600;
      background: var(--link-ext-bg);
      padding: 0.4rem 0.85rem;
      border-radius: 6px;
      border: 1px solid var(--border-strong);
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .ext-link:hover {
      background: var(--link-ext-hover);
      color: var(--link-hover);
      text-decoration: underline;
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
      color: #9ca3af;
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
      text-decoration: none;
    }
    .footer-nav-item:focus-visible {
      outline: 2px solid var(--link-color);
    }
    .icon-sub {
      width: 0.875rem;
      height: 0.875rem;
      flex-shrink: 0;
      display: inline-block;
      vertical-align: middle;
    }
    .footer-chip {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.6875rem;
      font-weight: 700;
      background: var(--bg-card);
      color: var(--text-primary);
      padding: 0.05rem 0.3rem;
      border-radius: 3px;
      border: 1px solid var(--border-subtle);
      line-height: 1.2;
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
      color: #9ca3af;
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
    .footer-engine-version {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.6875rem;
      color: var(--text-secondary);
      background: var(--bg-card);
      border: 1px solid var(--border-strong);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-weight: 600;
    }
    .footer-muted-text {
      color: #9ca3af;
    }
    .footer-meta-block {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .footer-timestamp {
      color: var(--text-secondary);
      font-feature-settings: "tnum";
    }
    @media (max-width: 640px) {
      body {
        padding: 0;
      }
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
      footer.site-footer {
        padding: 1.5rem 0.75rem 2rem 0.75rem;
        text-align: center;
      }
      .status-banner {
        padding: 1rem;
        gap: 0.75rem;
      }
      .status-banner-content h1 {
        font-size: 1.125rem;
      }
      .status-banner-content p {
        font-size: 0.875rem;
      }
      .kpi-grid {
        grid-template-columns: 1fr;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
      }
      .kpi-card {
        padding: 1rem;
      }
      .kpi-value {
        font-size: 1.5rem;
      }
      .component-card {
        padding: 1rem;
      }
      .component-header {
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .bars-row {
        gap: 1px;
        height: 20px;
      }
      .matrix-legend {
        font-size: 0.6875rem;
      }
      summary.incident-summary {
        padding: 0.875rem 1rem;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .incident-title-wrap {
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .ecosystem-links {
        flex-direction: column;
        gap: 0.5rem;
      }
      .ext-link {
        width: 100%;
        justify-content: space-between;
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
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
    @media (forced-colors: active) {
      .badge, .day-bar, .incident-severity, .update-stage, .status-banner, .kpi-card, .component-card {
        forced-color-adjust: none;
        border: 1px solid ButtonText;
      }
    }
  </style>
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <header class="site-header" role="banner">
    <div class="brand-group">
      <a class="brand-wrap" href="${escapeHtml(ctx.mainSiteUrl)}" aria-label="Montage Subtitle Translator Status home">
        <span class="brand-title">Montage Subtitle Translator Status</span>
      </a>
      <span class="brand-sub">Service Availability &amp; Incident Monitoring</span>
    </div>
    <nav class="header-links" aria-label="Quick links">
      <a href="${escapeHtml(ctx.mainSiteUrl)}" aria-label="Go to main application">Main App</a>
      <a href="${escapeHtml(reportIssueHref)}"${reportIssueTarget} ${reportIssueAria}>${escapeHtml(reportIssueLabel)}</a>
      <a href="${escapeHtml(ctx.githubRepoUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View project on GitHub (opens in a new tab)">GitHub</a>
    </nav>
  </header>

  <main id="main-content" class="layout-container" role="main">
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
        <div class="kpi-label" id="kpi-90d-label">Rolling 90-Day Uptime</div>
        <div class="kpi-value" aria-labelledby="kpi-90d-label">${snapshot.summary.rolling90dRatio.toFixed(2)}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label" id="kpi-24h-label">Past 24-Hour Availability</div>
        <div class="kpi-value" aria-labelledby="kpi-24h-label">${snapshot.summary.past24hAvailability.toFixed(1)}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label" id="kpi-incidents-label">Active Disruptions</div>
        <div class="kpi-value" aria-labelledby="kpi-incidents-label">${snapshot.summary.activeIncidentsCount}</div>
      </div>
    </section>

    ${groupsHtml}

    ${renderIncidents(snapshot.incidents)}

    <section class="ecosystem-section" aria-labelledby="eco-title">
      <h2 id="eco-title" class="ecosystem-title">Official Upstream Status Feeds</h2>
      <div class="ecosystem-links">${externalLinksHtml}</div>
    </section>
  </main>

  <footer class="site-footer" role="contentinfo">
    <div class="footer-primary">
      <div class="footer-brand-block">
        <div class="footer-brand-title">Montage Subtitle Translator Status</div>
        <div class="footer-brand-desc">Service health and operational status.</div>
      </div>
      <nav class="footer-nav" aria-label="Status page resources">
        <a class="footer-nav-item" href="${escapeHtml(mainSiteBase)}/docs/terms/" target="_blank" rel="noopener noreferrer" aria-label="View Terms of Service (opens in a new tab)">Terms</a>
        <a class="footer-nav-item" href="${escapeHtml(mainSiteBase)}/docs/privacy/" target="_blank" rel="noopener noreferrer" aria-label="View Privacy Policy (opens in a new tab)">Privacy</a>
        <a class="footer-nav-item" href="${escapeHtml(reportIssueHref)}"${reportIssueTarget} ${reportIssueAria}>${escapeHtml(reportIssueLabel)}</a>
        <a class="footer-nav-item" href="${escapeHtml(ctx.statusUrl)}/status.json" target="_blank" rel="noopener noreferrer" aria-label="View status API in JSON format (opens in a new tab)"><svg class="icon-sub" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>Status API</a>
        <a class="footer-nav-item" href="${escapeHtml(ctx.statusUrl)}/badge.svg" target="_blank" rel="noopener noreferrer" aria-label="View status SVG badge (opens in a new tab)"><svg class="icon-sub" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>Status Badge</a>
      </nav>
    </div>

    <div class="footer-secondary">
      <div class="footer-copyright">
        <span>&copy; ${currentYear} MontageSubs</span>
        <span class="footer-sep" aria-hidden="true">&bull;</span>
        <span class="footer-engine-version" aria-label="Status monitoring engine version">Status System v${escapeHtml(versionString)}</span>
      </div>
      <div class="footer-meta-block">
        <span class="footer-timestamp"><time datetime="${escapeHtml(snapshot.meta.generatedAt)}">${escapeHtml(formatUtcTimestamp(snapshot.meta.generatedAt))}</time></span>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

export function renderNotFoundGatewayHtml(mainSiteUrl: string): string {
  const normalizedBase = String(mainSiteUrl || "https://subs.js.org/subtitle-translator/").replace(/\/+$/, "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Montage Subtitle Translator</title>
  <script>
    (function () {
      var lang = (navigator.language || "en").toLowerCase();
      var target = "en";
      if (lang.indexOf("zh") === 0) {
        var isTraditional = lang.indexOf("hant") !== -1 || lang.indexOf("zh-tw") === 0 || lang.indexOf("zh-hk") === 0 || lang.indexOf("zh-mo") === 0;
        target = isTraditional ? "zh-Hant" : "zh-Hans";
      }
      var cleanPath = window.location.pathname.replace(/^\\/+/, "");
      var dest = "${normalizedBase}/" + target + "/" + cleanPath + (window.location.search || "") + (window.location.hash || "");
      window.location.replace(dest);
    })();
  </script>
  <noscript>
    <meta http-equiv="refresh" content="0; url=${normalizedBase}/" />
  </noscript>
</head>
<body>
  <noscript>
    <p><a href="${normalizedBase}/">Continue to Montage Subtitle Translator</a></p>
  </noscript>
</body>
</html>`;
}
