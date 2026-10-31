import { stripTrailingSlashes } from "../config";
import { Asset } from "./pages";

const CRAWLABLE_PATHS = ["/", "/badges/"] as const;

function renderSitemap(statusBase: string, lastModified: string): string {
  const urls = CRAWLABLE_PATHS.map((path) => `  <url>\n    <loc>${statusBase}${path}</loc>\n    <lastmod>${lastModified}</lastmod>\n  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildDiscoveryAssets(statusUrl: string, generatedAt: string): Asset[] {
  const statusBase = stripTrailingSlashes(statusUrl);
  if (!statusBase) return [];
  return [
    { path: "sitemap.xml", content: renderSitemap(statusBase, generatedAt.slice(0, 10)), contentType: "application/xml" },
    { path: "robots.txt", content: `User-agent: *\nAllow: /\nSitemap: ${statusBase}/sitemap.xml\n`, contentType: "text/plain" },
  ];
}
