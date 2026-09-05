import { OverallStatus } from "./types";

interface BadgeColors {
  fill: string;
  text: string;
}

const STATUS_CONFIG: Record<OverallStatus, { text: string; color: string }> = {
  operational: { text: "operational", color: "#10b981" },
  degraded: { text: "degraded", color: "#f59e0b" },
  major_outage: { text: "outage", color: "#ef4444" },
  maintenance: { text: "maintenance", color: "#3b82f6" },
};

export function renderStatusBadge(status: OverallStatus): string {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.operational;
  const label = "service";
  const rightText = cfg.text;
  const rightColor = cfg.color;

  const leftWidth = 50;
  const rightWidth = Math.max(60, rightText.length * 7 + 16);
  const totalWidth = leftWidth + rightWidth;
  const leftCenter = Math.floor(leftWidth / 2);
  const rightCenter = leftWidth + Math.floor(rightWidth / 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${rightText}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="20" fill="#555"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${rightColor}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${leftCenter}" y="14" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${leftCenter}" y="13">${label}</text>
    <text x="${rightCenter}" y="14" fill="#010101" fill-opacity=".3">${rightText}</text>
    <text x="${rightCenter}" y="13">${rightText}</text>
  </g>
</svg>`;
}
