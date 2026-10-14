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
