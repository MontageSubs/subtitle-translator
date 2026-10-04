import { OverallStatus } from "../types";

export const OVERALL_CONFIG: Record<
  OverallStatus,
  { title: string; subtitle: string; icon: string }
> = {
  operational: {
    title: "All Systems Operational",
    subtitle:
      "All services are online and operating normally.",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6L9 17l-5-5"/></svg>`,
  },
  degraded: {
    title: "Degraded Performance",
    subtitle:
      "One or more services are experiencing issues or increased latency.",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  },
  major_outage: {
    title: "Major System Outage",
    subtitle:
      "A critical service or multiple providers are currently unavailable.",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  },
  maintenance: {
    title: "System Maintenance",
    subtitle:
      "Active maintenance is currently in progress. Some services may be unavailable.",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>`,
  },
};

const FAVICON_COLOR: Record<OverallStatus, string> = {
  operational: "%2310b981",
  degraded: "%23f59e0b",
  major_outage: "%23ef4444",
  maintenance: "%232563eb",
};

export function buildFaviconSvg(status: OverallStatus): string {
  const fill = FAVICON_COLOR[status] || FAVICON_COLOR.operational;
  const glyph =
    status === "operational"
      ? "<path d='M9 17l4.5 4.5L23 11' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/>"
      : "<rect x='14.5' y='7' width='3' height='11' rx='1.5' fill='white'/><circle cx='16' cy='23' r='1.8' fill='white'/>";
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='16' fill='${fill}'/>${glyph}</svg>`;
}

export const buildFaviconDataUri = (status: OverallStatus): string =>
  `data:image/svg+xml,${buildFaviconSvg(status).replace(/</g, "%3C").replace(/>/g, "%3E")}`;
