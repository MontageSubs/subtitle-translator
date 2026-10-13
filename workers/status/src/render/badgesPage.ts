import { OverallStatus, StatusComponent, SystemStatusSnapshot, TranslationStats } from "../types";
import { formatUtcTimestamp } from "../timeFormat";
import { componentBadgeLabel, formatCompactMetric, renderComponentStatusBadge, renderComponentUptimeBadge, renderDayTranslationsBadge, renderServiceStatusBadge, renderTotalTranslationsBadge, renderUptimeBadge } from "./badge";
import { GROUP_ORDER, GROUP_TITLES } from "./components";
import { escapeHtml } from "./html";
import { buildFaviconDataUri, OVERALL_CONFIG } from "./overall";
import { RenderContext } from "./page";
import { BASE_STYLES, THEME_TOKENS } from "./theme";

interface BadgeItem {
  id: string;
  name: string;
  category: "system" | "core_services" | "translation_engines" | "infrastructure_dependencies";
  categoryLabel: string;
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
    a:focus-visible, button:focus-visible, input:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 3px;
      border-radius: 4px;
    }
    .layout-container {
      width: 100%;
      max-width: 1040px;
      margin: 0 auto;
      padding: 0 clamp(1rem, 3.5vw, 2.5rem);
      flex: 1;
    }
    header.site-header {
      width: 100%;
      padding: 1.25rem clamp(1rem, 3.5vw, 3rem);
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 1rem;
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
      font-weight: 700;
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
      font-size: 0.875rem;
    }
    .header-links a {
      color: var(--text-secondary);
      text-decoration: none;
      font-weight: 500;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      transition: color 0.15s ease, background-color 0.15s ease;
    }
    .header-links a:hover {
      color: var(--text-primary);
      background-color: var(--bg-subtle);
    }
    .nav-active {
      color: var(--link-color) !important;
      font-weight: 600 !important;
      background-color: var(--bg-subtle);
    }
    .badges-hero {
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: clamp(1.5rem, 4vw, 2.25rem);
      background: var(--bg-card);
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }
    .badges-hero-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .badges-hero-title-group h1 {
      font-size: clamp(1.5rem, 3.5vw, 2rem);
      font-weight: 800;
      letter-spacing: -0.025em;
      color: var(--text-primary);
      line-height: 1.2;
      margin-bottom: 0.35rem;
    }
    .badges-hero-desc {
      font-size: 0.9375rem;
      color: var(--text-secondary);
      max-width: 680px;
      line-height: 1.5;
    }
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-decoration: none;
      background: var(--bg-subtle);
      border: 1px solid var(--border-strong);
      padding: 0.45rem 0.85rem;
      border-radius: 8px;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .back-btn:hover {
      color: var(--text-primary);
      background: var(--link-ext-hover);
    }
    .badges-stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
      margin-top: 1.25rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--border-subtle);
    }
    .stat-box {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .stat-label {
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }
    .stat-val {
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
    }
    .pulse-dot.dot-degraded { background: #f59e0b; }
    .pulse-dot.dot-outage { background: #ef4444; }
    .pulse-dot.dot-maintenance { background: #2563eb; }
    .controls-panel {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }
    .controls-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .search-input-wrap {
      position: relative;
      flex: 1;
      min-width: 220px;
    }
    .search-input-wrap svg {
      position: absolute;
      left: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
    }
    .search-input {
      width: 100%;
      height: 38px;
      padding: 0 0.75rem 0 2.25rem;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      font-size: 0.875rem;
      color: var(--text-primary);
      font-family: inherit;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }
    .search-input:focus {
      border-color: var(--focus-ring);
      background: var(--bg-card);
    }
    .format-selector {
      display: inline-flex;
      background: var(--bg-subtle);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      gap: 2px;
    }
    .format-btn {
      font-family: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: transparent;
      border: none;
      padding: 0.35rem 0.75rem;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .format-btn.active {
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    }
    .category-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .category-tab {
      font-family: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.35rem 0.7rem;
      border-radius: 9999px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-subtle);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .category-tab:hover {
      color: var(--text-primary);
      border-color: var(--border-strong);
    }
    .category-tab.active {
      background: var(--text-primary);
      color: var(--bg-page);
      border-color: var(--text-primary);
    }
    .badges-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .badge-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1.125rem;
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .badge-card:hover {
      border-color: var(--border-strong);
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.06);
    }
    .badge-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .badge-card-title {
      font-size: 0.9375rem;
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.3;
    }
    .badge-cat-tag {
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      background: var(--bg-subtle);
      color: var(--text-muted);
      border: 1px solid var(--border-subtle);
      white-space: nowrap;
    }
    .badge-stage {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      min-height: 52px;
    }
    .badge-stage svg {
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.08));
    }
    .badge-snippet-wrap {
      display: flex;
      align-items: center;
      background: var(--bg-summary);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      overflow: hidden;
    }
    .badge-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 0.75rem;
      color: var(--text-secondary);
      padding: 0.4rem 0.6rem;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      user-select: all;
    }
    .copy-btn {
      font-family: inherit;
      background: var(--bg-subtle);
      border: none;
      border-left: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      padding: 0.45rem 0.65rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.75rem;
      font-weight: 600;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .copy-btn:hover {
      background: var(--border-subtle);
      color: var(--text-primary);
    }
    .copy-btn.copied {
      background: #059669;
      color: #ffffff;
    }
    .badge-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 0.5rem;
      border-top: 1px dashed var(--border-subtle);
      font-size: 0.75rem;
    }
    .badge-val-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      color: var(--text-secondary);
      font-weight: 600;
    }
    .badge-open-link {
      color: var(--link-color);
      text-decoration: none;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .badge-open-link:hover {
      text-decoration: underline;
    }
    .empty-state {
      grid-column: 1 / -1;
      text-align: center;
      padding: 3rem 1rem;
      background: var(--bg-card);
      border: 1px dashed var(--border-strong);
      border-radius: 12px;
      color: var(--text-secondary);
    }
    .embed-guide {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }
    .embed-guide h2 {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 0.5rem;
    }
    .embed-guide p {
      font-size: 0.875rem;
      color: var(--text-secondary);
      line-height: 1.5;
      margin-bottom: 1rem;
    }
    .guide-blocks {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
    }
    .guide-block {
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1rem;
    }
    .guide-block h3 {
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 0.35rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .guide-block pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.75rem;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 0.65rem;
      overflow-x: auto;
      color: var(--text-primary);
    }
    .toast {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background: var(--text-primary);
      color: var(--bg-page);
      padding: 0.65rem 1.125rem;
      border-radius: 8px;
      font-size: 0.8125rem;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 9999;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
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
    }
    .footer-brand-desc {
      font-size: 0.75rem;
      color: var(--text-muted);
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
    .icon-sub {
      width: 0.875rem;
      height: 0.875rem;
      flex-shrink: 0;
      display: inline-block;
      vertical-align: middle;
    }
    @media (max-width: 640px) {
      .badges-hero {
        padding: 1.25rem 1rem;
      }
      .badges-stats-grid {
        grid-template-columns: 1fr 1fr;
      }
      .badges-grid {
        grid-template-columns: 1fr;
      }
      header.site-header {
        flex-direction: column;
        align-items: flex-start;
      }
      .controls-row {
        flex-direction: column;
        align-items: stretch;
      }
      .format-selector {
        width: 100%;
        justify-content: center;
      }
    }
`;

function buildBadgesList(
  snapshot: SystemStatusSnapshot,
  stats?: TranslationStats | null,
): BadgeItem[] {
  const items: BadgeItem[] = [];

  const overallStatus = snapshot.summary.overallStatus;
  const overallText = OVERALL_CONFIG[overallStatus]?.title || overallStatus;
  items.push({
    id: "system-service",
    name: "Overall Service Status",
    category: "system",
    categoryLabel: "System Status",
    badgePath: "badges/status/service.svg",
    badgeSvg: renderServiceStatusBadge(overallStatus),
    currentValue: overallText,
    statusClass: `dot-${overallStatus}`,
  });

  items.push({
    id: "system-uptime",
    name: "90-Day Rolling Uptime",
    category: "system",
    categoryLabel: "System Metric",
    badgePath: "badges/status/uptime.svg",
    badgeSvg: renderUptimeBadge(snapshot.summary.rolling90dRatio),
    currentValue: `${snapshot.summary.rolling90dRatio.toFixed(2)}%`,
    statusClass: "dot-operational",
  });

  items.push({
    id: "translations-total",
    name: "Total Translations Count",
    category: "system",
    categoryLabel: "Volume Metric",
    badgePath: "badges/translations/total.svg",
    badgeSvg: renderTotalTranslationsBadge(stats?.total ?? 0),
    currentValue: `${formatCompactMetric(stats?.total ?? 0)} completed`,
    statusClass: "dot-operational",
  });

  items.push({
    id: "translations-24h",
    name: "Past 24h Translations Count",
    category: "system",
    categoryLabel: "Volume Metric",
    badgePath: "badges/translations/24h.svg",
    badgeSvg: renderDayTranslationsBadge(stats?.last24h ?? 0),
    currentValue: `${formatCompactMetric(stats?.last24h ?? 0)} past 24h`,
    statusClass: "dot-operational",
  });

  const componentsByGroup = new Map<string, StatusComponent[]>();
  for (const group of GROUP_ORDER) {
    componentsByGroup.set(group, []);
  }
  for (const component of snapshot.components) {
    const list = componentsByGroup.get(component.group) || [];
    list.push(component);
    componentsByGroup.set(component.group, list);
  }

  for (const group of GROUP_ORDER) {
    const components = componentsByGroup.get(group) || [];
    for (const comp of components) {
      const shortLabel = componentBadgeLabel(comp);
      const isDegraded = comp.status === "degraded_performance" || comp.status === "partial_outage";
      const isOutage = comp.status === "major_outage";
      const isMaint = comp.status === "maintenance";
      const dotClass = isOutage ? "dot-outage" : isDegraded ? "dot-degraded" : isMaint ? "dot-maintenance" : "dot-operational";

      items.push({
        id: `component-status-${comp.id}`,
        name: `${comp.name} Status`,
        category: comp.group,
        categoryLabel: GROUP_TITLES[comp.group] || "Service",
        badgePath: `badges/components/${comp.id}.svg`,
        badgeSvg: renderComponentStatusBadge(shortLabel, comp.status),
        currentValue: comp.status.replace(/_/g, " "),
        statusClass: dotClass,
      });

      items.push({
        id: `component-uptime-${comp.id}`,
        name: `${comp.name} Uptime`,
        category: comp.group,
        categoryLabel: GROUP_TITLES[comp.group] || "Service",
        badgePath: `badges/components/${comp.id}-uptime.svg`,
        badgeSvg: renderComponentUptimeBadge(shortLabel, comp.uptime90d),
        currentValue: `${comp.uptime90d.toFixed(2)}%`,
        statusClass: "dot-operational",
      });
    }
  }

  return items;
}

function renderBadgeCard(item: BadgeItem, baseUrl: string): string {
  const fullUrl = `${baseUrl}/${item.badgePath}`;
  const markdownSnippet = `![${item.name}](${fullUrl})`;
  const htmlSnippet = `<img src="${fullUrl}" alt="${escapeHtml(item.name)}" />`;
  const urlSnippet = fullUrl;

  return `
    <article class="badge-card" data-category="${escapeHtml(item.category)}" data-search="${escapeHtml((item.name + " " + item.badgePath + " " + item.categoryLabel).toLowerCase())}">
      <div class="badge-card-header">
        <h2 class="badge-card-title">${escapeHtml(item.name)}</h2>
        <span class="badge-cat-tag">${escapeHtml(item.categoryLabel)}</span>
      </div>
      <div class="badge-stage">
        ${item.badgeSvg}
      </div>
      <div class="badge-snippet-wrap">
        <span class="badge-code" data-md="${escapeHtml(markdownSnippet)}" data-html="${escapeHtml(htmlSnippet)}" data-url="${escapeHtml(urlSnippet)}">${escapeHtml(markdownSnippet)}</span>
        <button type="button" class="copy-btn" aria-label="Copy snippet for ${escapeHtml(item.name)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span>Copy</span>
        </button>
      </div>
      <div class="badge-card-footer">
        <span class="badge-val-badge">
          <span class="pulse-dot ${escapeHtml(item.statusClass)}" aria-hidden="true"></span>
          <span>${escapeHtml(item.currentValue)}</span>
        </span>
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
  var format = 'md';
  var activeCategory = 'all';
  var searchQuery = '';
  var toastTimer = null;

  var cards = Array.from(document.querySelectorAll('.badge-card'));
  var emptyState = document.getElementById('empty-state');
  var toast = document.getElementById('copy-toast');
  var searchInput = document.getElementById('badge-search');
  var formatBtns = document.querySelectorAll('.format-btn');
  var categoryTabs = document.querySelectorAll('.category-tab');

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() {
      toast.classList.remove('show');
    }, 2200);
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
    if (!btn) return;
    btn.classList.add('copied');
    var label = btn.querySelector('span');
    if (label) label.textContent = 'Copied!';
    setTimeout(function() {
      btn.classList.remove('copied');
      if (label) label.textContent = 'Copy';
    }, 1800);
  }

  function updateCardFormats() {
    cards.forEach(function(card) {
      var code = card.querySelector('.badge-code');
      if (!code) return;
      var text = code.getAttribute('data-' + format) || '';
      code.textContent = text;
    });
  }

  function filterCards() {
    var visibleCount = 0;
    var q = searchQuery.trim().toLowerCase();

    cards.forEach(function(card) {
      var cat = card.getAttribute('data-category');
      var searchData = card.getAttribute('data-search') || '';

      var matchesCat = (activeCategory === 'all') || (cat === activeCategory);
      var matchesSearch = !q || (searchData.indexOf(q) !== -1);

      if (matchesCat && matchesSearch) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (emptyState) {
      emptyState.style.display = visibleCount === 0 ? 'block' : 'none';
    }
  }

  formatBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      formatBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      format = btn.getAttribute('data-format') || 'md';
      updateCardFormats();
    });
  });

  categoryTabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      categoryTabs.forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeCategory = tab.getAttribute('data-category') || 'all';
      filterCards();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', function() {
      searchQuery = searchInput.value;
      filterCards();
    });
  }

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.copy-btn');
    if (!btn) return;
    var wrap = btn.closest('.badge-snippet-wrap');
    if (!wrap) return;
    var code = wrap.querySelector('.badge-code');
    if (!code) return;
    var text = code.textContent || '';
    copyText(text, btn);
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
<html lang="en">
<head>
  <meta charset="utf-8" />
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
  <header class="site-header" role="banner">
    <div class="brand-group">
      <a class="brand-wrap" href="${escapeHtml(statusBase)}/" title="Status Overview">
        <span class="brand-title">Montage Subtitle Translator Status</span>
      </a>
      <span class="brand-sub">Service Availability &amp; Incident Monitoring</span>
    </div>
    <nav class="header-links" aria-label="Navigation">
      <a href="${escapeHtml(statusBase)}/" title="Status Page">Overview</a>
      <a class="nav-active" href="${escapeHtml(statusBase)}/badges/" title="Status Badges" aria-current="page">Badges</a>
      <a href="${escapeHtml(ctx.mainSiteUrl)}" title="Main App">Main App</a>
      <a href="${escapeHtml(ctx.issueReportUrl)}" title="Report Issue">Report Issue</a>
    </nav>
  </header>

  <main id="main-content" class="layout-container" role="main">
    <section class="badges-hero" aria-labelledby="badges-hero-title">
      <div class="badges-hero-top">
        <div class="badges-hero-title-group">
          <h1 id="badges-hero-title">Status Badges</h1>
          <p class="badges-hero-desc">
            Production-grade live SVG badges representing real-time system status, rolling uptime, and service health. Embed them directly into your GitHub README, documentation, and external monitors.
          </p>
        </div>
        <a class="back-btn" href="${escapeHtml(statusBase)}/">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          <span>Back to Status</span>
        </a>
      </div>

      <div class="badges-stats-grid" aria-label="Status Badges Metrics">
        <div class="stat-box">
          <span class="stat-label">Available Badges</span>
          <span class="stat-val">${totalBadges}</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Overall Service</span>
          <span class="stat-val">
            <span class="pulse-dot dot-${escapeHtml(overallKey)}" aria-hidden="true"></span>
            <span>${escapeHtml(OVERALL_CONFIG[overallKey]?.title || overallKey)}</span>
          </span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Rolling 90d Uptime</span>
          <span class="stat-val">${snapshot.summary.rolling90dRatio.toFixed(2)}%</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Edge Cache TTL</span>
          <span class="stat-val">60s (Auto)</span>
        </div>
      </div>
    </section>

    <section class="controls-panel" aria-label="Badge Filters &amp; Format Controls">
      <div class="controls-row">
        <div class="search-input-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="search" id="badge-search" class="search-input" placeholder="Filter badges by service name or keyword..." aria-label="Search badges" />
        </div>
        <div class="format-selector" role="radiogroup" aria-label="Snippet format">
          <button type="button" class="format-btn active" data-format="md" role="radio" aria-checked="true">Markdown</button>
          <button type="button" class="format-btn" data-format="html" role="radio" aria-checked="false">HTML</button>
          <button type="button" class="format-btn" data-format="url" role="radio" aria-checked="false">Direct URL</button>
        </div>
      </div>

      <div class="category-tabs" role="tablist" aria-label="Badge category filter">
        <button type="button" class="category-tab active" data-category="all" role="tab" aria-selected="true">All (${totalBadges})</button>
        <button type="button" class="category-tab" data-category="system" role="tab" aria-selected="false">System &amp; Metrics</button>
        <button type="button" class="category-tab" data-category="core_services" role="tab" aria-selected="false">Core Services</button>
        <button type="button" class="category-tab" data-category="translation_engines" role="tab" aria-selected="false">Translation Engines</button>
        <button type="button" class="category-tab" data-category="infrastructure_dependencies" role="tab" aria-selected="false">Infrastructure</button>
      </div>
    </section>

    <div class="badges-grid" id="badges-container">
      ${cardsHtml}
      <div id="empty-state" class="empty-state" style="display: none;">
        <p>No matching badges found. Try adjusting your search query or filter.</p>
      </div>
    </div>

    <section class="embed-guide" aria-labelledby="guide-title">
      <h2 id="guide-title">Integration &amp; Embedding Guide</h2>
      <p>
        All badges are served as standard, cache-optimized SVGs with CORS enabled (<code>Access-Control-Allow-Origin: *</code>). They update automatically every status arbitration cycle and render crisp on retina displays.
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
