import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = resolve(APP_DIR, "dist");
const BASE_PATH = process.env.VITE_BASE_PATH || "/";
const SITE_URL = process.env.VITE_SITE_URL || "https://subs.js.org/subtitle-translator";

function extractBuiltAssets(): string {
  const html = readFileSync(resolve(DIST_DIR, "index.html"), "utf-8");
  const tags = html.match(/<link[^>]+rel="(?:stylesheet|modulepreload)"[^>]*>|<script[^>]+src="[^"]+"[^>]*><\/script>/g) ?? [];
  return tags.join("\n    ");
}

function writePage(routeSegments: string[], html: string): void {
  const outDir = resolve(DIST_DIR, ...routeSegments);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "index.html"), html);
}

async function main(): Promise<void> {
  const assetsHtml = extractBuiltAssets();
  const vite = await createServer({ root: APP_DIR, server: { middlewareMode: true }, appType: "custom" });
  const ssr = await vite.ssrLoadModule("/src/render/ssrEntry.ts");
  const {
    docPages, staticPages, PAGE_IDS, LOCALES, translate, TITLE_KEYS, DESCRIPTION_KEYS,
    renderDocument, renderDocsListBody, renderDocsDetailBody, renderStaticPageBody, renderJsRequiredBody,
  } = ssr;

  const docCategories: string[] = Array.from(new Set(docPages.map((page: any) => page.category as string)));
  const jsOnlyPages = PAGE_IDS.filter((page: string) => !["docs", "about", "apps", "contribute", "nmt"].includes(page));

  for (const locale of LOCALES) {
    const ctx = { locale, basePath: BASE_PATH } as const;

    for (const page of ["about", "apps", "contribute"] as const) {
      const list = staticPages[page] as any[];
      const found = list.find((p) => p.locale === locale);
      const body = renderStaticPageBody(locale, found, `page.${page}.placeholder`);
      const title = translate(locale, TITLE_KEYS[page]);
      const description = translate(locale, DESCRIPTION_KEYS[page]);
      const html = renderDocument({ ...ctx, page }, { title, description, routeSegments: [page] }, body, assetsHtml, SITE_URL);
      writePage([locale, page], html);
    }

    const docsBody = renderDocsListBody(locale, BASE_PATH, docCategories, docPages, "newest");
    const docsHtml = renderDocument(
      { ...ctx, page: "docs" },
      { title: translate(locale, TITLE_KEYS.docs), description: translate(locale, DESCRIPTION_KEYS.docs), routeSegments: ["docs"] },
      docsBody, assetsHtml, SITE_URL
    );
    writePage([locale, "docs"], docsHtml);

    for (const docPage of docPages.filter((p: any) => p.locale === locale)) {
      const detailBody = renderDocsDetailBody(locale, BASE_PATH, docPage);
      const detailHtml = renderDocument(
        { ...ctx, page: "docs" },
        { title: docPage.title, description: translate(locale, "meta.docs.description"), routeSegments: ["docs", docPage.slug] },
        detailBody, assetsHtml, SITE_URL
      );
      writePage([locale, "docs", docPage.slug], detailHtml);
    }

    const nmtBody = renderJsRequiredBody(locale, "nmt");
    const nmtHtml = renderDocument(
      { ...ctx, page: "nmt" },
      { title: translate(locale, TITLE_KEYS.nmt), description: translate(locale, DESCRIPTION_KEYS.nmt), routeSegments: [] },
      nmtBody, assetsHtml, SITE_URL
    );
    writePage([locale], nmtHtml);

    for (const page of jsOnlyPages) {
      const body = renderJsRequiredBody(locale, page);
      const html = renderDocument(
        { ...ctx, page },
        { title: translate(locale, TITLE_KEYS[page]), description: translate(locale, DESCRIPTION_KEYS[page]), routeSegments: [page], noindex: page === "history" },
        body, assetsHtml, SITE_URL
      );
      writePage([locale, page], html);
    }

    const legacyNmtRedirectHtml = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#b5482f" />
    <link rel="canonical" href="${SITE_URL}/${locale}/" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="0; url=${BASE_PATH}${locale}/" />
    <title>${translate(locale, "brand.name")}</title>
    <script>location.replace("${BASE_PATH}${locale}/");</script>
  </head>
  <body>
    <a href="${BASE_PATH}${locale}/">${translate(locale, "brand.name")} &rarr;</a>
  </body>
</html>`;
    writePage([locale, "nmt"], legacyNmtRedirectHtml);
  }

  function renderLanguageGatewayPage(subPath: string): string {
    const normalizedBase = BASE_PATH.endsWith("/") ? BASE_PATH : BASE_PATH + "/";
    const cleanSub = subPath.replace(/^\/+/, "");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Montage Subtitle Translator</title>
  <script>
    (function () {
      var lang = (navigator.language || "en").toLowerCase();
      var target = "en";
      if (lang.indexOf("zh") === 0) {
        var isTraditional = lang.indexOf("hant") !== -1 || lang.indexOf("zh-tw") === 0 || lang.indexOf("zh-hk") === 0 || lang.indexOf("zh-mo") === 0;
        target = isTraditional ? "zh-Hant" : "zh-Hans";
      }
      var dest = "${normalizedBase}" + target + "/${cleanSub}" + (location.search || "") + (location.hash || "");
      location.replace(dest);
    })();
  </script>
  <noscript>
    <style>
      :root{--bg:#faf9f6;--panel:#ffffff;--text:#1c1b19;--line:#e4e0d6;--accent:#b5482f}
      @media(prefers-color-scheme:dark){:root{--bg:#16151a;--panel:#1e1d23;--text:#ece9e2;--line:#322f36;--accent:#e18a63}}
      html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
      .language-gate{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;text-align:center;background:var(--bg)}
      .language-gate h1{font-size:2rem;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;color:var(--text)}
      .language-gate p{font-size:1rem;margin:0 0 24px;opacity:0.8;color:var(--text)}
      .language-options{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;max-width:740px;margin:0 auto}
      .language-options a{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:140px;padding:10px 20px;border-radius:9999px;border:1px solid var(--line);background:var(--panel);color:var(--text);text-decoration:none;font-size:0.95rem;font-weight:500;white-space:nowrap;transition:border-color .15s ease,color .15s ease}
      .language-options a:hover,.language-options a:focus{border-color:var(--accent);color:var(--accent)}
    </style>
    <div class="language-gate">
      <h1>Montage Subtitle Translator</h1>
      <p>Select your language</p>
      <div class="language-options">
        <a href="${normalizedBase}en/${cleanSub}">English</a>
        <a href="${normalizedBase}zh-Hans/${cleanSub}">简体中文</a>
        <a href="${normalizedBase}zh-Hant/${cleanSub}">繁體中文</a>
      </div>
    </div>
  </noscript>
</head>
<body></body>
</html>`;
  }

  for (const page of ["about", "apps", "contribute", "history", "discussions", "nmt"] as const) {
    writePage([page], renderLanguageGatewayPage(page + "/"));
  }
  writePage(["docs"], renderLanguageGatewayPage("docs/"));

  const distinctSlugs: string[] = Array.from(new Set(docPages.map((p: any) => p.slug as string)));
  for (const slug of distinctSlugs) {
    writePage(["docs", slug], renderLanguageGatewayPage(`docs/${slug}/`));
  }

  await vite.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
