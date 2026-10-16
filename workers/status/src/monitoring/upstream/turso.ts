import { ComponentStatus } from "../../types";
import { fetchJson } from "./fetch";

const TURSO_STATUS_URL = "https://status.turso.tech/index.json";
const DOWNTIME_STATES = ["downtime", "major_outage", "outage"];
const DEGRADED_STATES = ["degraded", "partial_outage", "degraded_performance"];
const CRITICAL_RESOURCE_PATTERN = /\b(?:api|global|website)\b/;
const SETTLED_REPORT_STATES = ["resolved", "completed"];

const normalize = (value: unknown): string => String(value || "").toLowerCase();

function parseTursoStatusJson(data: any): ComponentStatus {
  if (!data || typeof data !== "object") return "operational";

  let hasDowntime = false;
  let hasDegraded = false;
  let hasResources = false;

  for (const item of Array.isArray(data.included) ? data.included : []) {
    if (!item.attributes) continue;

    if (item.type === "status_page_resource") {
      hasResources = true;
      const state = normalize(item.attributes.status);
      const name = normalize(item.attributes.public_name);
      if (DOWNTIME_STATES.includes(state)) {
        if (CRITICAL_RESOURCE_PATTERN.test(name)) hasDowntime = true;
        else hasDegraded = true;
      } else if (DEGRADED_STATES.includes(state)) {
        hasDegraded = true;
      }
    } else if (item.type === "status_report") {
      const reportState = normalize(item.attributes.aggregate_state);
      const hasStarted = !item.attributes.starts_at || Date.parse(item.attributes.starts_at) <= Date.now();
      if (reportState && hasStarted && !SETTLED_REPORT_STATES.includes(reportState)) hasDegraded = true;
    }
  }

  if (hasDowntime) return "major_outage";
  if (hasDegraded) return "degraded_performance";
  if (hasResources) return "operational";

  const aggregateState = normalize(data.data?.attributes?.aggregate_state);
  if (DOWNTIME_STATES.includes(aggregateState)) return "major_outage";
  return DEGRADED_STATES.includes(aggregateState) ? "degraded_performance" : "operational";
}

export async function pollTursoStatus(): Promise<ComponentStatus> {
  const data = await fetchJson("Turso", TURSO_STATUS_URL);
  return data ? parseTursoStatusJson(data) : "operational";
}
