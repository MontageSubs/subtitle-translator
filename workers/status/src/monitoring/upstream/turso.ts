import { ComponentStatus } from "../../types";
import { fetchJson } from "./fetch";

const TURSO_STATUS_URL = "https://status.turso.tech/index.json";
const DOWNTIME_STATES = ["downtime", "major_outage", "outage"];
const DEGRADED_STATES = ["degraded", "partial_outage", "degraded_performance"];
const CRITICAL_RESOURCE_KEYWORDS = ["api", "global", "website"];
const SETTLED_REPORT_STATES = ["resolved", "completed"];

const normalize = (value: unknown): string => String(value || "").toLowerCase();

function parseTursoStatusJson(data: any): ComponentStatus {
  if (!data || typeof data !== "object") return "operational";

  const aggregateState = normalize(data.data?.attributes?.aggregate_state);
  if (DOWNTIME_STATES.includes(aggregateState)) return "major_outage";
  if (DEGRADED_STATES.includes(aggregateState)) return "degraded_performance";

  let hasDowntime = false;
  let hasDegraded = false;

  for (const item of Array.isArray(data.included) ? data.included : []) {
    if (!item.attributes) continue;

    if (item.type === "status_page_resource") {
      const state = normalize(item.attributes.status);
      const name = normalize(item.attributes.public_name);
      if (DOWNTIME_STATES.includes(state)) {
        if (CRITICAL_RESOURCE_KEYWORDS.some((keyword) => name.includes(keyword))) hasDowntime = true;
        else hasDegraded = true;
      } else if (state === "degraded" || state === "partial_outage" || state === "maintenance") {
        hasDegraded = true;
      }
    } else if (item.type === "status_report") {
      const reportState = normalize(item.attributes.aggregate_state);
      if (reportState && !SETTLED_REPORT_STATES.includes(reportState)) hasDegraded = true;
    }
  }

  if (hasDowntime) return "major_outage";
  return hasDegraded ? "degraded_performance" : "operational";
}

export async function pollTursoStatus(): Promise<ComponentStatus> {
  const data = await fetchJson("Turso", TURSO_STATUS_URL);
  return data ? parseTursoStatusJson(data) : "operational";
}
