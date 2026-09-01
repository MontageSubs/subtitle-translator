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

  await vite.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
