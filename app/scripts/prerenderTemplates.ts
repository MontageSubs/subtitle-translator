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
}

export function renderLanguageGatewayPage({ basePath, subPath, locales, defaultLocale, storageKey }: GatewayPageOptions): string {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const cleanSub = subPath.replace(/^\/+/, "");
  return `<!doctype html>
<html lang="${defaultLocale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Montage Subtitle Translator</title>
  <script>
    (function () {
      var supported = ${JSON.stringify(locales)};
      var target = ${JSON.stringify(defaultLocale)};
      var saved = null;
      try { saved = localStorage.getItem(${JSON.stringify(storageKey)}); } catch (e) {}
      if (supported.indexOf(saved) !== -1) {
        target = saved;
      } else {
        var lang = (navigator.language || target).toLowerCase();
        if (lang.indexOf("zh") === 0) {
          var isTraditional = lang.indexOf("hant") !== -1 || lang.indexOf("zh-tw") === 0 || lang.indexOf("zh-hk") === 0 || lang.indexOf("zh-mo") === 0;
          target = isTraditional ? "zh-Hant" : "zh-Hans";
        }
      }
      var dest = "${normalizedBase}" + target + "/${cleanSub}" + (location.search || "") + (location.hash || "");
      location.replace(dest);
    })();
  </script>
  <noscript>
    <meta http-equiv="refresh" content="0; url=${normalizedBase}" />
  </noscript>
</head>
<body>
  <noscript>
    <p><a href="${normalizedBase}">Continue to Montage Subtitle Translator</a></p>
  </noscript>
</body>
</html>`;
}
