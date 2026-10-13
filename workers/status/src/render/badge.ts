import { OverallStatus } from "../types";

const STATUS_CONFIG: Record<OverallStatus, { text: string; color: string }> = {
  operational: { text: "operational", color: "#10b981" },
  degraded: { text: "degraded", color: "#f59e0b" },
  major_outage: { text: "outage", color: "#ef4444" },
  maintenance: { text: "maintenance", color: "#2563eb" },
};

function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function estimateTextWidth(text: string): number {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char >= "0" && char <= "9") width += 7.0;
    else if (char === "." || char === ":" || char === " " || char === ",") width += 4.0;
    else if (char === "%") width += 8.5;
    else if (char === "i" || char === "l" || char === "j" || char === "t" || char === "f") width += 4.5;
    else if (char === "m" || char === "w" || char === "M" || char === "W") width += 9.5;
    else if (char >= "A" && char <= "Z") width += 7.8;
    else width += 6.5;
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
  const leftWidth = Math.max(40, estimateTextWidth(label) + 14);
  const rightWidth = Math.max(36, estimateTextWidth(value) + 14);
  const totalWidth = leftWidth + rightWidth;
  const leftCenter = Math.floor(leftWidth / 2);
  const rightCenter = leftWidth + Math.floor(rightWidth / 2);

  // Generate unique IDs per badge label to prevent inline SVG clip-path/gradient collisions
  const uid = label.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "badge";
  const clipId = `r-${uid}`;
  const gradId = `s-${uid}`;

  const escapedLabel = escapeXml(label);
  const escapedValue = escapeXml(value);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${escapedLabel}: ${escapedValue}">
  <linearGradient id="${gradId}" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="${clipId}">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#${clipId})">
    <rect width="${leftWidth}" height="20" fill="#555"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#${gradId})"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${leftCenter}" y="15" fill="#010101" fill-opacity=".3">${escapedLabel}</text>
    <text x="${leftCenter}" y="14">${escapedLabel}</text>
    <text x="${rightCenter}" y="15" fill="#010101" fill-opacity=".3">${escapedValue}</text>
    <text x="${rightCenter}" y="14">${escapedValue}</text>
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
