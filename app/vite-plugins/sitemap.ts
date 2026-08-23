import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import type { Plugin } from "vite";

interface DocManifestEntry {
  slug: string;
  route: string;
}

export function sitemapPlugin(docsRoot: string, siteUrl: string, locales: readonly string[], pageIds: readonly string[]): Plugin {
  return {
    name: "sitemap",
    apply: "build",
    generateBundle() {
      const base = siteUrl.replace(/\/$/, "");
      const manifest = load(readFileSync(resolve(docsRoot, "manifest.yml"), "utf-8")) as DocManifestEntry[];
      const docSlugs = manifest.filter((entry) => entry.route === "docs").map((entry) => entry.slug);
      const urls: string[] = [`${base}/`];

      for (const locale of locales) {
        for (const page of pageIds) urls.push(`${base}/${locale}/${page}/`);
        for (const slug of docSlugs) urls.push(`${base}/${locale}/docs/${slug}/`);
      }

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((url) => `  <url><loc>${url}</loc></url>`)
        .join("\n")}\n</urlset>\n`;
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });

      const robots = `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
    },
  };
}
