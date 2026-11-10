export type OverallStatus =
  "operational" | "degraded" | "major_outage" | "maintenance";

export type ComponentStatus =
  | "operational"
  | "degraded_performance"
  | "partial_outage"
  | "major_outage"
  | "maintenance"
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
}

export type CellOverrides = Map<string, { status: HistoryCellStatus; uptime: number | null }>;

export const cellOverrideKey = (componentId: string, date: string): string => `${componentId}:${date}`;

export interface StatusComponent {
  id: string;
  name: string;
  group: ComponentGroup;
  status: ComponentStatus;
  uptime90d: number;
  history90d: ComponentHistoryEntry[];
  description?: string;
}

type UpdateAuthor = "auto" | "human";

export type MaintenancePhase = "upcoming" | "active" | "completed";

export interface IncidentUpdate {
  id?: string;
  author?: UpdateAuthor;
  phase?: MaintenancePhase;
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
  kind?: "maintenance";
  maintenanceId?: string;
  upstreamIds?: string[];
  manual?: true;
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

interface ExternalReference {
  name: string;
  url: string;
}

export type ServiceEndpointId = "status_site" | "service" | "web_app" | "models_site" | "assets_site";

export type EndpointSource = "primary" | "fallback" | "redirect_target";

export interface ServiceEndpoint {
  id: ServiceEndpointId;
  primaryUrl: string;
  fallbackUrl: string | null;
  recommendedSource: EndpointSource;
  redirectTargetUrl?: string;
}

export interface ReportedServiceEndpoints {
  primary: string;
  fallback: string;
}

export interface SystemStatusSnapshot {
  meta: {
    generatedAt: string;
    version: string;
    minClientVersion: string;
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
  endpoints: ServiceEndpoint[];
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
  | "unexpected_redirect"
  | "content_mismatch"
  | "unconfigured";

export interface ProbeResult {
  componentId: string | string[];
  success: boolean;
  httpStatus: number;
  latencyMs: number;
  detail?: string;
  errorType?: ProbeErrorType;
  responseSnippet?: string;
  redirectLocation?: string;
}

export interface ProbePair {
  primary: ProbeResult;
  fallback: ProbeResult | null;
}

export interface RedirectTargetProbe {
  url: string;
  probe: ProbeResult;
}

export interface WebAppProbes extends ProbePair {
  redirectTarget: RedirectTargetProbe | null;
}
