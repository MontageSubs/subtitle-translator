import { NOT_FOUND_ACTION, NOT_FOUND_CODE, NOT_FOUND_LABEL, NOT_FOUND_TEXT } from "../config/notFound";
import { escapeHtml } from "../utils/escapeHtml";

export interface NotFoundDocumentOptions {
  title: string;
  homeUrl: string;
  iconUrl: string;
  recoveryScript?: string;
}

const NOT_FOUND_STYLE = [
  ":root{--bg:#faf9f6;--panel:#ffffff;--text:#1c1b19;--line:#e4e0d6;--accent:#b5482f;color-scheme:light dark}",
  "@media(prefers-color-scheme:dark){:root{--bg:#16151a;--panel:#1e1d23;--text:#ece9e2;--line:#322f36;--accent:#e18a63}}",
  'html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}',
  ".not-found{display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}",
  ".not-found-panel{width:100%;max-width:480px;padding:clamp(1.5rem,5vw,2.5rem);box-sizing:border-box;border:1px solid var(--line);border-radius:12px;background:var(--panel);text-align:center}",
  ".not-found-code{margin:0 0 .75rem;font-size:clamp(3rem,14vw,4.5rem);font-weight:800;line-height:1;letter-spacing:-.04em;opacity:.45}",
  ".not-found-title{margin:0 0 .5rem;font-size:1.25rem;font-weight:700}",
  ".not-found-text{margin:0 0 1.5rem;opacity:.8}",
  ".not-found-action{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:.75rem 1.5rem;box-sizing:border-box;border:1px solid var(--line);border-radius:9999px;color:var(--text);font-weight:600;text-decoration:none}",
  ".not-found-action{transition:border-color .15s ease,color .15s ease,background-image .15s ease,scale .08s ease}",
  ".not-found-action:hover,.not-found-action:focus-visible{border-color:var(--accent);color:var(--accent)}",
  "@media(hover:hover) and (pointer:fine){.not-found-action:hover{--tint:color-mix(in srgb,var(--accent) 8%,transparent);background-image:linear-gradient(var(--tint),var(--tint))}}",
  ".not-found-action:active{--tint:color-mix(in srgb,var(--accent) 14%,transparent);background-image:linear-gradient(var(--tint),var(--tint));scale:.97}",
  "@media(prefers-reduced-motion:reduce){.not-found-action{transition:none}.not-found-action:active{scale:1}}",
].join("\n      ");

export function renderNotFoundDocument({ title, homeUrl, iconUrl, recoveryScript }: NotFoundDocumentOptions): string {
  const home = escapeHtml(homeUrl);
  const panel = `<main class="not-found">
      <section class="not-found-panel" aria-labelledby="not-found-title">
        <p class="not-found-code" aria-hidden="true">${NOT_FOUND_CODE}</p>
        <h1 id="not-found-title" class="not-found-title">${NOT_FOUND_LABEL}</h1>
        <p class="not-found-text">${NOT_FOUND_TEXT}</p>
        <a class="not-found-action" href="${home}">${NOT_FOUND_ACTION}</a>
      </section>
    </main>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" type="image/svg+xml" href="${escapeHtml(iconUrl)}" />
    <style>
      ${NOT_FOUND_STYLE}
    </style>${
      recoveryScript
        ? `
    <script>
      ${recoveryScript}
    </script>
    <noscript>
      <meta http-equiv="refresh" content="3;url=${home}" />
    </noscript>`
        : ""
    }
  </head>
  <body>
    ${recoveryScript ? `<noscript>\n    ${panel}\n    </noscript>` : panel}
  </body>
</html>
`;
}
