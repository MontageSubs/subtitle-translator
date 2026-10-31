import { BASE_STYLES, THEME_TOKENS } from "./theme";

export const BADGES_PAGE_STYLES = `${THEME_TOKENS}
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
    *, *::before, *::after {
      user-select: text;
      -webkit-user-select: text;
    }
    button, input[type="radio"], select, label.pill-btn, .pulse-dot, svg {
      user-select: none;
      -webkit-user-select: none;
    }
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
