import { Incident, IncidentStatus } from "../types";
import { ensureUpdateIds } from "../incidents/templates";
import { isMaintenance } from "../incidents/utils";
import { formatUtcTimestamp } from "../timeFormat";
import { escapeHtml } from "./html";

const MAINTENANCE_STATE_LABEL: Partial<Record<IncidentStatus, string>> = {
  investigating: "scheduled",
  identified: "scheduled",
  monitoring: "in progress",
};

function renderIncidentDetails(inc: Incident, open: boolean): string {
  const incId = inc.id;
  const tagKey = isMaintenance(inc) ? "maintenance" : inc.severity;
  const [stateLabel, stateClass] =
    isMaintenance(inc) && inc.status !== "resolved"
      ? [MAINTENANCE_STATE_LABEL[inc.status] ?? inc.status, "maintenance"]
      : [inc.status === "resolved" && isMaintenance(inc) ? "completed" : inc.status, inc.status];
  const updatesWithIds = ensureUpdateIds(inc.updates || [])
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  const updatesHtml = updatesWithIds
    .map(
      (u, index) => {
        const isLatest = index === 0;
        const circleClass = isLatest ? `timeline-circle stage-${escapeHtml(u.status)}` : "timeline-circle";
        return `
    <li class="incident-update-item" id="${escapeHtml(u.id || '')}">
      <div class="timeline-marker">
        <div class="${circleClass}"></div>
      </div>
      <div class="update-content">
        <div class="update-meta">
          <span class="update-stage stage-${escapeHtml(u.status)}" aria-label="Stage: ${escapeHtml(u.status)}">${escapeHtml(u.status.toUpperCase())}</span>
          <time class="update-time" datetime="${escapeHtml(u.timestamp)}" data-utc="${escapeHtml(formatUtcTimestamp(u.timestamp))}">${escapeHtml(formatUtcTimestamp(u.timestamp))}</time>
          ${u.id ? `<span class="update-msg-id" style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted); margin-left: auto;" title="Message ID: ${escapeHtml(u.id)}">ID: <span>${escapeHtml(u.id)}</span></span>` : ""}
        </div>
        <div class="update-body">${escapeHtml(u.body)}</div>
      </div>
    </li>
  `})
    .join("");

  return `
  <details class="incident-item" data-id="${escapeHtml(incId)}" ${open ? "open" : ""}>
    <summary class="incident-summary" aria-label="Incident: ${escapeHtml(inc.title)}, Severity: ${escapeHtml(inc.severity)}, Status: ${escapeHtml(inc.status)}" onclick="var e = arguments[0] || window.event; if(window.getSelection().toString()) e.preventDefault();">
      <div class="incident-title-wrap" style="flex: 1; word-break: break-word; line-height: 1.5;">
        <span class="incident-severity severity-${escapeHtml(tagKey)}" aria-label="Severity: ${escapeHtml(tagKey)}" style="margin-right: 0.5rem; font-weight: 600;">[${escapeHtml(tagKey.toUpperCase())}]</span>
        <span class="incident-title" style="font-weight: 500;">${escapeHtml(inc.title)}</span>
        <span style="color: var(--text-muted); font-size: 0.875rem; margin-left: 0.25rem; white-space: nowrap;">
          - <time class="incident-date" datetime="${escapeHtml(inc.createdAt)}" data-utc="${escapeHtml(formatUtcTimestamp(inc.createdAt))}">${escapeHtml(formatUtcTimestamp(inc.createdAt))}</time>
        </span>
        <a href="#${escapeHtml(incId)}" class="incident-link-icon" style="color: var(--text-muted); text-decoration: none; margin-left: 0.25rem;" title="Permalink" onclick="var e = arguments[0] || window.event; e.stopPropagation();">#</a>
      </div>
      <span class="incident-state state-${escapeHtml(stateClass)}" aria-label="Status: ${escapeHtml(stateLabel)}">${escapeHtml(stateLabel.toUpperCase())}</span>
    </summary>
    <ul id="${escapeHtml(incId)}" class="incident-timeline" aria-label="Timeline of updates for ${escapeHtml(inc.title)}">
      ${updatesHtml}
    </ul>
  </details>
`;
}

const monthKeyOf = (ms: number): string => new Date(ms).toISOString().slice(0, 7);

export function renderIncidents(incidents: Incident[], retentionDays: number, nowMs: number): string {
  const title = `<h2 id="incidents-title" class="panel-title">Past Incidents &amp; Maintenance</h2>`;
  if (!incidents || incidents.length === 0) {
    return `
      <section class="incidents-container panel" aria-labelledby="incidents-title">
        ${title}
        <div class="empty-incidents" role="status">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span>No incidents or maintenance reported in the past ${retentionDays} days. All services are operating normally.</span>
        </div>
      </section>
    `;
  }

  const buckets = new Map<string, Incident[]>();
  const ordered = [...incidents].sort(
    (a, b) =>
      Number(b.status !== "resolved") - Number(a.status !== "resolved") ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  for (const inc of ordered) {
    const key = monthKeyOf(Date.parse(inc.createdAt));
    buckets.set(key, [...(buckets.get(key) ?? []), inc]);
  }

  const currentMonthKey = monthKeyOf(nowMs);
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthGroupsHtml = [...buckets.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, group]) => {
      const [year, month] = key.split("-").map(Number);
      const label = monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
      const itemsHtml = group.map((inc) => renderIncidentDetails(inc, inc.status !== "resolved")).join("");
      const isOpen = key === currentMonthKey || group.some((inc) => inc.status !== "resolved");
      return `
      <details class="month-group" ${isOpen ? "open" : ""}>
        <summary class="month-group-summary">${escapeHtml(label)} <span class="month-group-count">(${group.length} incident${group.length === 1 ? "" : "s"})</span></summary>
        <div class="month-group-items">${itemsHtml}</div>
      </details>
    `;
    })
    .join("");

  return `
    <section class="incidents-container panel" aria-labelledby="incidents-title">
      ${title}
      <div class="month-groups" aria-label="Incidents by month">${monthGroupsHtml}</div>
    </section>
  `;
}
