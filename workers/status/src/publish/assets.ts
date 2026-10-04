import { SystemStatusSnapshot, TranslationStats } from "../types";
import { renderNotFoundHtml } from "../render/notFound";
import { RenderContext, renderStatusHtml } from "../render/page";
import { renderOverallBadgeSvg } from "../render/badge";
import { buildFaviconSvg } from "../render/overall";
import { Asset } from "./pages";

const SITE_HEADERS = `/*
  Access-Control-Allow-Origin: *
  Cache-Control: no-cache, must-revalidate

/sw.js
  Cache-Control: no-store

/status.json
  Content-Type: application/json; charset=utf-8
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=30

/stats.json
  Content-Type: application/json; charset=utf-8
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=30

/badge.svg
  Content-Type: image/svg+xml; charset=utf-8
  Access-Control-Allow-Origin: *
  Cache-Control: no-cache, must-revalidate

/favicon.ico
  Content-Type: image/svg+xml; charset=utf-8
`;

export function buildSiteAssets(
  snapshot: SystemStatusSnapshot,
  context: RenderContext,
  stats?: TranslationStats | null,
): Asset[] {
  const assets: Asset[] = [
    { path: "index.html", content: renderStatusHtml(snapshot, context), contentType: "text/html" },
    { path: "404.html", content: renderNotFoundHtml(), contentType: "text/html" },
    { path: "status.json", content: JSON.stringify(snapshot, null, 2), contentType: "application/json" },
    { path: "badge.svg", content: renderOverallBadgeSvg(snapshot.summary.overallStatus), contentType: "image/svg+xml" },
    { path: "favicon.ico", content: buildFaviconSvg(snapshot.summary.overallStatus), contentType: "image/svg+xml" },
    { path: "_headers", content: SITE_HEADERS, contentType: "text/plain" },
  ];
  if (stats) {
    assets.push({ path: "stats.json", content: JSON.stringify(stats, null, 2), contentType: "application/json" });
  }
  return assets;
}
