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
  const links = locales.map((loc) => `<a href="${normalizedBase}${loc}/${cleanSub}">${localeNames?.[loc] ?? loc}</a>`).join("\n      ");
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
      var supported = ${JSON.stringify(locales)};
      var target = ${JSON.stringify(defaultLocale)};
      var saved = null;
      try { saved = localStorage.getItem(${JSON.stringify(storageKey)}); } catch (e) {}
      if (supported.indexOf(saved) !== -1) {
        target = saved;
      } else {
        var userLangs = typeof navigator !== "undefined" && navigator.languages && navigator.languages.length ? navigator.languages : [typeof navigator !== "undefined" ? navigator.language : ""];
        for (var i = 0; i < userLangs.length; i++) {
          var raw = (userLangs[i] || "").split(";")[0].trim().replace(/_/g, "-");
          if (!raw) continue;
          var exact = supported.find(function (s) { return s.toLowerCase() === raw.toLowerCase(); });
          if (exact) { target = exact; break; }
          var parts = raw.split("-");
          var lang = parts[0].toLowerCase();
          if (lang === "zh") {
            var isTrad = raw.indexOf("Hant") !== -1 || parts.indexOf("TW") !== -1 || parts.indexOf("HK") !== -1 || parts.indexOf("MO") !== -1 || /cht|traditional/i.test(raw);
            var prefZh = isTrad ? "zh-Hant" : "zh-Hans";
            var altZh = isTrad ? "zh-Hans" : "zh-Hant";
            var matchedZh = supported.find(function (s) { return s.toLowerCase() === prefZh.toLowerCase(); })
              || supported.find(function (s) { return s.toLowerCase() === altZh.toLowerCase(); });
            if (matchedZh) { target = matchedZh; break; }
          }
          var prefix = supported.find(function (s) {
            var sLow = s.toLowerCase();
            var rLow = raw.toLowerCase();
            return rLow.indexOf(sLow + "-") === 0 || sLow.indexOf(rLow + "-") === 0 || sLow === lang;
          });
          if (prefix) { target = prefix; break; }
        }
      }
      var dest = "${normalizedBase}" + target + "/${cleanSub}" + (location.search || "") + (location.hash || "");
      location.replace(dest);
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
