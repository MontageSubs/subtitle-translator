import { ComponentGroup, ComponentStatus, Incident, StatusComponent } from "../types";
import { componentIdsOf, incidentCoversDate, isMaintenance } from "../incidents/utils";
import { escapeHtml } from "./html";

export const GROUP_TITLES: Record<ComponentGroup, string> = {
  core_services: "Core Services",
  translation_engines: "Translation Providers",
  infrastructure_dependencies: "Infrastructure Services",
};

export const GROUP_ORDER: ComponentGroup[] = [
  "core_services",
  "translation_engines",
  "infrastructure_dependencies",
];

const STATUS_TEXT: Record<ComponentStatus, string> = {
  operational: "Operational",
  degraded_performance: "Degraded Performance",
  partial_outage: "Partial Outage",
  major_outage: "Major Outage",
  maintenance: "Under Maintenance",
  no_data: "No Data Available",
};

function renderComponentBadge(status: ComponentStatus): string {
  const text = STATUS_TEXT[status] || "Operational";
  let colorClass = "badge-operational";
  if (status === "degraded_performance") colorClass = "badge-degraded";
  else if (status === "partial_outage") colorClass = "badge-partial";
  else if (status === "major_outage") colorClass = "badge-outage";
  else if (status === "maintenance") colorClass = "badge-maintenance";
  else if (status === "no_data") colorClass = "badge-nodata";

  return `<span class="badge ${colorClass}" role="status" aria-label="Status: ${escapeHtml(text)}">${escapeHtml(text)}</span>`;
}

function findIncidentForDay(
  incidents: Incident[],
  componentId: string,
  dateStr: string,
  nowMs: number,
): Incident | undefined {
  return (incidents || []).filter(Boolean).find(
    (inc) => !isMaintenance(inc) && componentIdsOf(inc).includes(componentId) && incidentCoversDate(inc, dateStr, nowMs),
  );
}

function renderBarMatrix(component: StatusComponent, incidents: Incident[], nowMs: number): string {
  const history = component.history90d || [];
  const barsHtml = history
    .map((cell) => {
      let colorClass = "bar-emerald";
      let tooltipDesc = "100.0% operational";
      if (cell.status === "nodata" || cell.uptime === null) {
        colorClass = "bar-slate";
        tooltipDesc = "No data recorded";
      } else if (cell.status === "outage" || cell.uptime < 90.0) {
        colorClass = "bar-red";
        tooltipDesc = `${cell.uptime.toFixed(1)}% - Major outage recorded`;
      } else if (cell.status === "degraded" || cell.uptime < 100.0) {
        colorClass = "bar-amber";
        tooltipDesc = `${cell.uptime.toFixed(1)}% - Degraded performance observed`;
      }

      const accessibleText = `${cell.date}: ${tooltipDesc}`;
      const relatedIncident =
        colorClass === "bar-red" || colorClass === "bar-amber"
          ? findIncidentForDay(incidents, component.id, cell.date, nowMs)
          : undefined;

      if (relatedIncident) {
        return `<a class="day-bar ${colorClass}" href="#${escapeHtml(relatedIncident.id)}" title="${escapeHtml(accessibleText)}" aria-label="${escapeHtml(accessibleText)}, view incident"></a>`;
      }
      return `<div class="day-bar ${colorClass}" title="${escapeHtml(accessibleText)}" role="button" tabindex="0" aria-label="${escapeHtml(accessibleText)}"></div>`;
    })
    .join("");

  const days = history.length;
  const uptimeLabel =
    component.uptime90d >= 0
      ? `${component.uptime90d.toFixed(2)}% uptime`
      : "N/A";
  const srSummary =
    component.uptime90d >= 0
      ? `${days}-day historical uptime: ${component.uptime90d.toFixed(2)} percent.`
      : `${days}-day history not yet available.`;

  return `
    <div class="matrix-wrap" aria-label="${days}-day daily uptime history for ${escapeHtml(component.name)}">
      <span class="sr-only">${escapeHtml(srSummary)}</span>
      <div class="bars-row" role="region" aria-label="Daily uptime timeline">${barsHtml}</div>
      <div class="matrix-legend" aria-hidden="true">
        <span>${days} days ago</span>
        <span class="matrix-uptime">${uptimeLabel}</span>
        <span>Today</span>
      </div>
    </div>
  `;
}

export function renderComponentCard(component: StatusComponent, incidents: Incident[], nowMs: number): string {
  const activeIncident = (incidents || []).filter(Boolean).find(
    (i) => i.status !== "resolved" && componentIdsOf(i).includes(component.id),
  );
  const badgeHtml = renderComponentBadge(component.status);
  const statusWrap = activeIncident && component.status !== "operational"
    ? `<a href="#${escapeHtml(activeIncident.id)}" class="incident-link" style="text-decoration:none;" title="View related incident">${badgeHtml}</a>`
    : badgeHtml;

  return `
    <article class="component-card" id="comp-${escapeHtml(component.id)}" aria-labelledby="comp-title-${escapeHtml(component.id)}">
      <div class="component-header">
        <h3 id="comp-title-${escapeHtml(component.id)}" class="component-name">${escapeHtml(component.name)}</h3>
        <div class="component-status-wrap">
          ${statusWrap}
        </div>
      </div>
      ${renderBarMatrix(component, incidents, nowMs)}
    </article>
  `;
}
