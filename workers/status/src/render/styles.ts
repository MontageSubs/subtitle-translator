import { BASE_STYLES, THEME_TOKENS } from "./theme";

export const PAGE_STYLES = `${THEME_TOKENS}
${BASE_STYLES}    .sr-only {
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
    .header-links a,
    .header-links button {
      color: var(--text-secondary);
      text-decoration: none;
      font-weight: 500;
      font-size: 0.875rem;
      padding: 0.25rem 0.375rem;
      border-radius: 6px;
      transition: color 0.15s ease;
      line-height: 1.3;
      background: none;
      border: none;
      cursor: pointer;
      font-family: inherit;
    }
    .header-links a:hover,
    .header-links button:hover {
      color: var(--text-primary);
      text-decoration: none;
    }
    .header-links a:focus-visible,
    .header-links button:focus-visible {
      outline: 2px solid var(--link-color);
      color: var(--link-hover);
    }
    .no-js .js-only {
      display: none !important;
    }
    .js-only {
      display: inline-flex;
      align-items: center;
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
    .legend {
      margin-bottom: 2rem;
    }
    .legend-list {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1.25rem;
      padding: 0.875rem 1.125rem;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8125rem;
      color: var(--text-secondary);
    }
    .legend-swatch {
      display: inline-block;
      width: 0.75rem;
      height: 0.75rem;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .legend-swatch.banner-maintenance {
      background-color: var(--blue-banner-bg);
    }
    .panel {
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 2rem;
      background: rgba(255, 255, 255, 0.4);
    }
    @media (prefers-color-scheme: dark) {
      .panel {
        background: rgba(15, 23, 42, 0.3);
      }
    }
    .core-services-container .status-banner {
      margin-bottom: 1.25rem;
    }
    .core-services-container .kpi-grid {
      margin-bottom: 1.25rem;
    }
    .panel-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0 0 1rem 0;
      letter-spacing: -0.015em;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .third-party-group {
      margin-top: 1.25rem;
    }
    .third-party-group:first-of-type {
      margin-top: 0;
    }
    .third-party-group-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-secondary);
      margin: 0 0 0.875rem 0;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .group-title {
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
    .badge-maintenance { color: var(--blue-badge-text); background: var(--blue-badge-bg); border-color: var(--blue-badge-border); }
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
      text-decoration: none;
    }
    .day-bar:hover, .day-bar:focus-visible {
      opacity: 0.85;
      transform: scaleY(1.18);
    }
    .bar-emerald { background-color: var(--green-bar); }
    .bar-amber { background-color: var(--amber-bar); }
    .bar-red { background-color: var(--red-bar); }
    .bar-slate { background-color: var(--slate-bar); }

    .matrix-legend {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--text-muted);
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
      background: var(--bg-summary);
      border-bottom: 1px solid transparent;
      min-height: 48px;
    }
    details.incident-item[open] summary.incident-summary {
      border-bottom-color: var(--border-subtle);
    }
    .incident-severity {
      font-size: 0.75rem;
      font-weight: 700;
    }
    .severity-minor { color: var(--amber-badge-text); }
    .severity-major { color: var(--red-badge-text); }
    .severity-maintenance { color: var(--blue-badge-text); }
    .severity-critical { color: var(--critical-badge-text); }
    .incident-state {
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      border-width: 1px;
      border-style: solid;
    }
    .state-investigating { background: var(--amber-badge-bg); color: var(--amber-badge-text); border-color: var(--amber-badge-border); }
    .state-identified { background: var(--red-badge-bg); color: var(--red-badge-text); border-color: var(--red-badge-border); }
    .state-monitoring { background: var(--bg-subtle); color: var(--link-color); border-color: var(--border-strong); }
    .state-maintenance { background: var(--blue-badge-bg); color: var(--blue-badge-text); border-color: var(--blue-badge-border); }
    .state-resolved { background: var(--green-badge-bg); color: var(--green-badge-text); border-color: var(--green-badge-border); }

    .incident-timeline {
      list-style: none;
      padding: 1.25rem 1.25rem 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0;
      scroll-margin-top: 4rem;
    }
    .incident-update-item {
      display: flex;
      gap: 1rem;
      position: relative;
      padding-bottom: 1.5rem;
    }
    .incident-update-item:last-child {
      padding-bottom: 0;
    }
    .timeline-marker {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 12px;
      position: relative;
      flex-shrink: 0;
    }
    .timeline-marker::after {
      content: "";
      position: absolute;
      top: 18px;
      bottom: -1rem;
      left: 50%;
      transform: translateX(-50%);
      width: 2px;
      background: var(--border-strong);
    }
    .incident-update-item:last-child .timeline-marker::after {
      display: none;
    }
    .timeline-circle {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid var(--border-strong);
      background: var(--bg-page);
      z-index: 1;
      margin-top: 5px;
    }
    .timeline-circle.stage-investigating { border-color: var(--amber-badge-text); background: var(--amber-badge-text); }
    .timeline-circle.stage-identified { border-color: var(--red-badge-text); background: var(--red-badge-text); }
    .timeline-circle.stage-monitoring { border-color: var(--link-color); background: var(--link-color); }
    .timeline-circle.stage-resolved { border-color: var(--green-badge-text); background: var(--green-badge-text); }
    
    .update-content {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      flex-grow: 1;
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
      color: var(--text-muted);
    }
    .update-body {
      font-size: 0.875rem;
      color: var(--text-primary);
    }
    .month-groups {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .month-group {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
    }
    .month-group-summary {
      cursor: pointer;
      padding: 0.75rem 1.25rem;
      font-weight: 600;
      color: var(--text-primary);
      font-size: 0.875rem;
    }
    .month-group-count {
      color: var(--text-muted);
      font-weight: 400;
    }
    .month-group-items {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0 0.75rem 0.75rem;
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
    .footer-meta-block {
      display: flex;
      align-items: center;
      gap: 0.5rem;
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
      .badge, .day-bar, .incident-severity, .update-stage, .status-banner, .kpi-card, .component-card, .panel, .back-to-app {
        forced-color-adjust: none;
        border: 1px solid ButtonText;
      }
    }
`;
