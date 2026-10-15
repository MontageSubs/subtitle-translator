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

export function renderLanguageGatewayPage({ basePath, subPath, locales, defaultLocale, storageKey, localeNames }: GatewayPageOptions): string {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const cleanSub = subPath.replace(/^\/+/, "");
  const links = locales.map((loc) => `<a href="${normalizedBase}${loc}/${cleanSub}" lang="${loc}" hreflang="${loc}">${localeNames?.[loc] ?? loc}</a>`).join("\n      ");
  return `<!doctype html>
<html lang="${defaultLocale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Montage Subtitle Translator</title>
  <link rel="icon" type="image/svg+xml" href="${normalizedBase}favicon.svg" />
  <style>
    :root{--bg:#faf9f6;--panel:#ffffff;--text:#1c1b19;--line:#e4e0d6;--accent:#b5482f}
    @media(prefers-color-scheme:dark){:root{--bg:#16151a;--panel:#1e1d23;--text:#ece9e2;--line:#322f36;--accent:#e18a63}}
    body{margin:0;padding:24px;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;text-align:center}
    .options{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:720px;margin:32px auto 0}
    .options a{display:inline-flex;align-items:center;padding:10px 20px;border-radius:9999px;border:1px solid var(--line);background:var(--panel);color:var(--text);text-decoration:none;font-weight:500}
    .options a:hover{border-color:var(--accent);color:var(--accent)}
  </style>
  <script>
    (function () {
      var target = ${renderLocaleResolver({ supported: locales, fallback: defaultLocale, storageKey })};
      location.replace(${JSON.stringify(normalizedBase)} + target + "/" + ${JSON.stringify(cleanSub)} + (location.search || "") + (location.hash || ""));
    })();
  </script>
</head>
<body>
  <noscript>
    <div class="options">
      ${links}
    </div>
  </noscript>
</body>
</html>`;
}
