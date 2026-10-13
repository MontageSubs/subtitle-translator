import { ComponentStatus, OverallStatus } from "../types";

const STATUS_CONFIG: Record<OverallStatus, { text: string; color: string }> = {
  operational: { text: "operational", color: "#10b981" },
  degraded: { text: "degraded", color: "#f59e0b" },
  major_outage: { text: "outage", color: "#ef4444" },
  maintenance: { text: "maintenance", color: "#2563eb" },
};

const COMPONENT_STATUS_CONFIG: Record<ComponentStatus, { text: string; color: string }> = {
  operational: { text: "operational", color: "#10b981" },
  degraded_performance: { text: "degraded", color: "#f59e0b" },
  partial_outage: { text: "degraded", color: "#f97316" },
  major_outage: { text: "outage", color: "#ef4444" },
  maintenance: { text: "maintenance", color: "#2563eb" },
  no_data: { text: "no data", color: "#64748b" },
};

function estimateTextWidth(text: string): number {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char >= "0" && char <= "9") width += 7.0;
    else if (char === "." || char === ":" || char === " ") width += 3.5;
    else if (char === "%") width += 8.0;
    else if (char === "k" || char === "v" || char === "x" || char === "y") width += 6.5;
    else if (char === "M" || char === "W") width += 8.5;
    else if (char >= "A" && char <= "Z") width += 7.5;
    else width += 6.2;
  }
  return Math.ceil(width);
}

export function formatCompactMetric(value: number): string {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  if (safe < 1000) return String(Math.floor(safe));
  if (safe < 1_000_000) {
    const k = safe / 1000;
    const formatted = k < 10 ? k.toFixed(1) : Math.round(k).toString();
    return `${formatted.replace(/\.0$/, "")}k`;
  }
  const m = safe / 1_000_000;
  const formatted = m < 10 ? m.toFixed(1) : Math.round(m).toString();
  return `${formatted.replace(/\.0$/, "")}M`;
}

export function renderBadgeSvg(label: string, value: string, color: string): string {
  const leftWidth = Math.max(38, estimateTextWidth(label) + 14);
  const rightWidth = Math.max(38, estimateTextWidth(value) + 14);
  const totalWidth = leftWidth + rightWidth;
  const leftCenter = Math.floor(leftWidth / 2);
  const rightCenter = leftWidth + Math.floor(rightWidth / 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="20" fill="#555"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${leftCenter}" y="14" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${leftCenter}" y="13">${label}</text>
    <text x="${rightCenter}" y="14" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${rightCenter}" y="13">${value}</text>
  </g>
</svg>`;
}

export function renderServiceStatusBadge(status: OverallStatus): string {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.operational;
  return renderBadgeSvg("service", cfg.text, cfg.color);
}

export function renderUptimeBadge(ratio: number): string {
  const safe = Number.isFinite(ratio) ? Math.max(0, Math.min(100, ratio)) : 100;
  const color = safe >= 99.5 ? "#10b981" : safe >= 95 ? "#f59e0b" : "#ef4444";
  return renderBadgeSvg("uptime", `${safe.toFixed(2)}%`, color);
}

export function renderTotalTranslationsBadge(total: number): string {
  return renderBadgeSvg("translations", formatCompactMetric(total), "#0284c7");
}

export function renderDayTranslationsBadge(last24h: number): string {
  return renderBadgeSvg("past 24h", formatCompactMetric(last24h), "#059669");
}

export function componentBadgeLabel(component: { id: string; name: string }): string {
  const map: Record<string, string> = {
    service_availability: "subtitle service",
    core_infrastructure: "infrastructure",
    status_system: "status system",
    upstream_google_pa: "google pa",
    upstream_google_v2: "google v2",
    upstream_microsoft: "microsoft",
    upstream_deepl: "deepl",
    upstream_cloudflare: "cloudflare",
    upstream_turso: "turso",
    upstream_azure: "azure",
    upstream_github: "github",
    google_pa: "google pa",
    google_v2: "google v2",
    microsoft: "microsoft",
    deepl: "deepl",
    cloudflare: "cloudflare",
    turso: "turso",
    azure: "azure",
    github: "github",
  };
  if (map[component.id]) return map[component.id];
  return component.name.toLowerCase().replace(/\s+(api|service|services|provider|providers)$/, "");
}

export function renderComponentStatusBadge(label: string, status: ComponentStatus): string {
  const cfg = COMPONENT_STATUS_CONFIG[status] || COMPONENT_STATUS_CONFIG.operational;
  return renderBadgeSvg(label, cfg.text, cfg.color);
}

export function renderComponentUptimeBadge(label: string, ratio: number): string {
  const safe = Number.isFinite(ratio) ? Math.max(0, Math.min(100, ratio)) : 100;
  const color = safe >= 99.5 ? "#10b981" : safe >= 95 ? "#f59e0b" : "#ef4444";
  return renderBadgeSvg(`${label} uptime`, `${safe.toFixed(2)}%`, color);
}
