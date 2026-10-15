import { renderLocaleResolver } from "../vite-plugins/i18n/localeGate";

export interface RedirectPageOptions {
  locale: string;
  brand: string;
  siteUrl: string;
  basePath: string;
}

export function renderLegacyRedirectPage({ locale, brand, siteUrl, basePath }: RedirectPageOptions): string {
  const target = `${basePath}${locale}/`;
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#b5482f" />
    <link rel="canonical" href="${siteUrl}/${locale}/" />
    <meta name="robots" content="noindex" />
    <link rel="icon" type="image/svg+xml" href="${basePath}favicon.svg" />
    <meta http-equiv="refresh" content="0; url=${target}" />
    <title>${brand}</title>
    <script>location.replace("${target}");</script>
  </head>
  <body>
    <a href="${target}">${brand} &rarr;</a>
  </body>
</html>`;
}

export interface GatewayPageOptions {
  basePath: string;
  subPath: string;
  locales: readonly string[];
  defaultLocale: string;
  storageKey: string;
  localeNames?: Record<string, string>;
}

const LANGUAGE_GATE_STYLE = [
  ":root{--bg:#faf9f6;--panel:#ffffff;--text:#1c1b19;--line:#e4e0d6;--accent:#b5482f}",
  "@media(prefers-color-scheme:dark){:root{--bg:#16151a;--panel:#1e1d23;--text:#ece9e2;--line:#322f36;--accent:#e18a63}}",
  'html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}',
  ".language-gate{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;text-align:center;background:var(--bg)}",
  ".language-gate h1{font-size:1.5rem;font-weight:600;margin:0 0 24px;letter-spacing:-0.01em;color:var(--text)}",
  ".language-options{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;max-width:740px;margin:0 auto}",
  ".language-options a{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:110px;padding:10px 20px;border-radius:9999px;border:1px solid var(--line);background:var(--panel);color:var(--text);text-decoration:none;font-size:0.95rem;font-weight:500;white-space:nowrap;transition:border-color .15s ease,color .15s ease}",
  ".language-options a:hover,.language-options a:focus{border-color:var(--accent);color:var(--accent)}",
].join("\n        ");

export function renderLanguageGatewayPage({ basePath, subPath, locales, defaultLocale, storageKey, localeNames }: GatewayPageOptions): string {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const cleanSub = subPath.replace(/^\/+/, "");
  const links = locales.map((loc) => `<a href="${normalizedBase}${loc}/${cleanSub}" lang="${loc}" hreflang="${loc}">${localeNames?.[loc] ?? loc}</a>`).join("\n          ");
  return `<!doctype html>
<html lang="${defaultLocale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Montage Subtitle Translator</title>
  <link rel="icon" type="image/svg+xml" href="${normalizedBase}favicon.svg" />
  <script>
    (function () {
      var target = ${renderLocaleResolver({ supported: locales, fallback: defaultLocale, storageKey })};
      location.replace(${JSON.stringify(normalizedBase)} + target + "/" + ${JSON.stringify(cleanSub)} + (location.search || "") + (location.hash || ""));
    })();
  </script>
</head>
<body>
  <noscript>
    <style>
        ${LANGUAGE_GATE_STYLE}
    </style>
    <div class="language-gate">
      <h1>Select Language</h1>
      <div class="language-options">
          ${links}
      </div>
    </div>
  </noscript>
</body>
</html>`;
}
