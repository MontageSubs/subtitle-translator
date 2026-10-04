import { OverallStatus } from "../types";
import { buildFaviconDataUri } from "./overall";
import { BASE_STYLES, THEME_TOKENS } from "./theme";

const NOT_FOUND_STYLES = `${THEME_TOKENS}
${BASE_STYLES}    a:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 3px;
      border-radius: 4px;
    }
    .not-found {
      flex: 1;
      display: grid;
      place-items: center;
      padding: clamp(1rem, 3vw, 2rem);
    }
    .not-found-panel {
      width: 100%;
      max-width: 480px;
      padding: clamp(1.5rem, 5vw, 2.5rem);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      background: var(--bg-card);
      text-align: center;
    }
    .not-found-code {
      font-size: clamp(3rem, 14vw, 4.5rem);
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.04em;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
    }
    .not-found-title {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.015em;
      margin-bottom: 0.5rem;
    }
    .not-found-text {
      color: var(--text-secondary);
      font-size: 0.9375rem;
      margin-bottom: 1.5rem;
    }
    .home-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: 48px;
      padding: 0.75rem 1.5rem;
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      background: var(--bg-subtle);
      color: var(--text-primary);
      font-weight: 600;
      font-size: 0.9375rem;
      text-decoration: none;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    .home-button svg {
      transition: transform 0.15s ease;
    }
    .home-button:hover,
    .home-button:focus-visible {
      background: var(--link-ext-hover);
    }
    .home-button:hover svg,
    .home-button:focus-visible svg {
      transform: translateX(-3px);
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        transition-duration: 0.01ms !important;
      }
    }
    @media (forced-colors: active) {
      .not-found-panel, .home-button {
        forced-color-adjust: none;
        border: 1px solid ButtonText;
      }
    }
`;

export function renderNotFoundHtml(overallStatus: OverallStatus): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="robots" content="noindex" />
  <title>Page Not Found | Montage Subtitle Translator Status</title>
  <link rel="icon" type="image/svg+xml" href="${buildFaviconDataUri(overallStatus)}" />
  <style>
${NOT_FOUND_STYLES}  </style>
</head>
<body>
  <main id="main-content" class="not-found">
    <section class="not-found-panel" aria-labelledby="not-found-title">
      <p class="not-found-code" aria-hidden="true">404</p>
      <h1 id="not-found-title" class="not-found-title">Page not found</h1>
      <p class="not-found-text">The page you are looking for does not exist or has been moved.</p>
      <a class="home-button" href="/">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        <span>Go to status page</span>
      </a>
    </section>
  </main>
</body>
</html>`;
}
