export type OverallStatus =
  "operational" | "degraded" | "major_outage" | "maintenance";

export type ComponentStatus =
  | "operational"
  | "degraded_performance"
  | "partial_outage"
  | "major_outage"
  | "no_data";

export type HistoryCellStatus =
  "operational" | "degraded" | "outage" | "nodata";

export type IncidentStatus =
  "investigating" | "identified" | "monitoring" | "resolved";

export type IncidentSeverity = "minor" | "major" | "critical";

export type ComponentGroup =
  "core_services" | "translation_engines" | "infrastructure_dependencies";

export interface ComponentHistoryEntry {
  date: string;
  status: HistoryCellStatus;
  uptime: number | null;
  totalEvents?: number;
  failureEvents?: number;
}

export interface StatusComponent {
  id: string;
  name: string;
  group: ComponentGroup;
  status: ComponentStatus;
  uptime90d: number;
  history90d: ComponentHistoryEntry[];
  description?: string;
}

export interface IncidentUpdate {
  timestamp: string;
  status: IncidentStatus;
  body: string;
}

export interface Incident {
  id: string;
  componentId: string | string[];
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  updates: IncidentUpdate[];
}

export interface ScheduledMaintenanceItem {
  id: string;
  componentId: string;
  title: string;
  startUtc: string;
  endUtc: string;
  severity: IncidentSeverity;
  description: string;
}

export interface ExternalReference {
  name: string;
  url: string;
}

export interface SystemStatusSnapshot {
  meta: {
    generatedAt: string;
    apiVersion: string;
    version: string;
    environment: "production";
    retentionDays: number;
    badgeUrl: string;
  };
  summary: {
    overallStatus: OverallStatus;
    rolling90dRatio: number;
    rollingDays: number;
    activeIncidentsCount: number;
    past24hAvailability: number;
  };
  components: StatusComponent[];
  incidents: Incident[];
  externalReferences: ExternalReference[];
}

export interface TranslationStats {
  total: number;
  last24h: number;
  updatedAt?: number;
}

export interface TursoConfig {
  url: string;
  authToken: string;
}

export interface ErrorBucketEntry {
  errorCode: number;
  count: number;
}

export interface WindowMetrics {
  totalJobs: number;
  errorsByCode: Map<number, number>;
  totalErrors: number;
}

export type ProbeErrorType =
  | "network_error"
  | "http_error"
  | "schema_error"
  | "auth_error"
  | "rate_limited"
  | "timeout"
  | "empty_response"
  | "unconfigured";

export interface ProbeResult {
  componentId: string | string[];
  success: boolean;
  httpStatus: number;
  latencyMs: number;
  detail?: string;
  errorType?: ProbeErrorType;
  responseSnippet?: string;
}

export function classifyDailyUptime(uptime: number): HistoryCellStatus {
  if (uptime >= 100.0) return "operational";
  if (uptime < 90.0) return "outage";
  return "degraded";
}
