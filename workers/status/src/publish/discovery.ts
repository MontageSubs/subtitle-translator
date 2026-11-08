import { stripTrailingSlashes } from "../config";
import { Asset } from "./pages";
import { BADGE_ASSET_PATHS, BADGE_ASSET_TITLES } from "./paths";

interface SitemapEntry {
  path: string;
  changeFrequency: "always" | "hourly";
  priority: string;
  images: Array<{ path: string; title: string }>;
}

const SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: "/", changeFrequency: "always", priority: "1.0", images: [] },
  {
    path: "/badges/",
    changeFrequency: "hourly",
    priority: "0.6",
    images: (Object.keys(BADGE_ASSET_PATHS) as Array<keyof typeof BADGE_ASSET_PATHS>).map((key) => ({
      path: `/${BADGE_ASSET_PATHS[key]}`,
      title: BADGE_ASSET_TITLES[key],
    })),
  },
];

function renderImages(statusBase: string, images: SitemapEntry["images"]): string {
  return images
    .map(
      (image) =>
        `\n    <image:image>\n      <image:loc>${statusBase}${image.path}</image:loc>\n      <image:title>${image.title}</image:title>\n    </image:image>`,
    )
    .join("");
}

function renderSitemap(statusBase: string, lastModified: string): string {
  const urls = SITEMAP_ENTRIES.map(
    (entry) =>
      `  <url>\n    <loc>${statusBase}${entry.path}</loc>\n    <lastmod>${lastModified}</lastmod>\n    <changefreq>${entry.changeFrequency}</changefreq>\n    <priority>${entry.priority}</priority>${renderImages(statusBase, entry.images)}\n  </url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>\n`;
}

export function buildDiscoveryAssets(statusUrl: string, generatedAt: string): Asset[] {
  const statusBase = stripTrailingSlashes(statusUrl);
  if (!statusBase) return [];
  return [
    { path: "sitemap.xml", content: renderSitemap(statusBase, generatedAt.replace(/\.\d+Z$/, "Z")), contentType: "application/xml" },
    { path: "robots.txt", content: `User-agent: *\nAllow: /\nSitemap: ${statusBase}/sitemap.xml\n`, contentType: "text/plain" },
  ];
}
