export const THEME_TOKENS = `
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

      --orange-badge-text: #7c2d12;
      --orange-badge-bg: #ffedd5;
      --orange-badge-border: #fed7aa;

      --red-banner-bg: #dc2626;
      --red-banner-border: #b91c1c;
      --red-bar: #ef4444;
      --red-badge-text: #7f1d1d;
      --red-badge-bg: #fee2e2;
      --red-badge-border: #fca5a5;

      --critical-badge-text: #ffffff;

      --blue-banner-bg: #2563eb;
      --blue-banner-border: #1d4ed8;

      --slate-bar: #cbd5e1;
      --slate-badge-text: #334155;
      --slate-badge-bg: #f1f5f9;
      --slate-badge-border: #cbd5e1;
      --blue-badge-text: #1e3a8a;
      --blue-badge-bg: #dbeafe;
      --blue-badge-border: #93c5fd;
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

        --orange-badge-text: #fdba74;
        --orange-badge-bg: #431407;
        --orange-badge-border: #9a3412;

        --red-banner-bg: #7f1d1d;
        --red-banner-border: #ef4444;
        --red-bar: #f87171;
        --red-badge-text: #fca5a5;
        --red-badge-bg: #450a0a;
        --red-badge-border: #991b1b;

        --critical-badge-text: #fef2f2;

        --blue-banner-bg: #1e3a8a;
        --blue-banner-border: #3b82f6;

        --slate-bar: #334155;
        --slate-badge-text: #94a3b8;
        --slate-badge-bg: #1e293b;
        --slate-badge-border: #334155;
        --blue-badge-text: #93c5fd;
        --blue-badge-bg: #172554;
        --blue-badge-border: #1d4ed8;
      }
    }
`;

export const BASE_STYLES = `    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
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
`;
