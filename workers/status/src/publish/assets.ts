import { SystemStatusSnapshot, TranslationStats } from "../types";
import { renderNotFoundHtml } from "../render/notFound";
import { RenderContext, renderStatusHtml } from "../render/page";
import { renderBadgesHtml } from "../render/badgesPage";
import {
  componentBadgeLabel,
  renderComponentStatusBadge,
  renderComponentUptimeBadge,
  renderDayTranslationsBadge,
  renderServiceStatusBadge,
  renderTotalTranslationsBadge,
  renderUptimeBadge,
} from "../render/badge";
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

/badges
  Content-Type: text/html; charset=utf-8
  Cache-Control: public, max-age=60, must-revalidate

/badges/
  Content-Type: text/html; charset=utf-8
  Cache-Control: public, max-age=60, must-revalidate

/badges/index.html
  Content-Type: text/html; charset=utf-8
  Cache-Control: public, max-age=60, must-revalidate

/badges/*.svg
  Content-Type: image/svg+xml; charset=utf-8
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=60, s-maxage=60, must-revalidate

/badges/*/*.svg
  Content-Type: image/svg+xml; charset=utf-8
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=60, s-maxage=60, must-revalidate
`;

export function buildSiteAssets(
  snapshot: SystemStatusSnapshot,
  context: RenderContext,
  stats?: TranslationStats | null,
): Asset[] {
  const totalTranslations = stats?.total ?? 0;
  const dayTranslations = stats?.last24h ?? 0;
  const serviceBadgeContent = renderServiceStatusBadge(snapshot.summary.overallStatus);

  const assets: Asset[] = [
    { path: "index.html", content: renderStatusHtml(snapshot, context), contentType: "text/html" },
    { path: "404.html", content: renderNotFoundHtml(snapshot.summary.overallStatus), contentType: "text/html" },
    { path: "badges/index.html", content: renderBadgesHtml(snapshot, context, stats), contentType: "text/html" },
    { path: "status.json", content: JSON.stringify(snapshot, null, 2), contentType: "application/json" },
    {
      path: "badges/status/service.svg",
      content: serviceBadgeContent,
      contentType: "image/svg+xml",
    },
    {
      path: "badges/status/uptime.svg",
      content: renderUptimeBadge(snapshot.summary.rolling90dRatio),
      contentType: "image/svg+xml",
    },
    {
      path: "badges/translations/total.svg",
      content: renderTotalTranslationsBadge(totalTranslations),
      contentType: "image/svg+xml",
    },
    {
      path: "badges/translations/24h.svg",
      content: renderDayTranslationsBadge(dayTranslations),
      contentType: "image/svg+xml",
    },
  ];

  for (const component of snapshot.components) {
    const shortLabel = componentBadgeLabel(component);
    assets.push({
      path: `badges/components/${component.id}.svg`,
      content: renderComponentStatusBadge(shortLabel, component.status),
      contentType: "image/svg+xml",
    });
    assets.push({
      path: `badges/components/${component.id}-uptime.svg`,
      content: renderComponentUptimeBadge(shortLabel, component.uptime90d),
      contentType: "image/svg+xml",
    });
  }

  assets.push({ path: "_headers", content: SITE_HEADERS, contentType: "text/plain" });

  if (stats) {
    assets.push({ path: "stats.json", content: JSON.stringify(stats, null, 2), contentType: "application/json" });
  }

  return assets;
}
