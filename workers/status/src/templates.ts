import {
  Incident,
  IncidentStatus,
  IncidentUpdate,
  IncidentSeverity,
} from "./types";

export type IncidentCategory =
  | "core_service"
  | "upstream_provider"
  | "storage"
  | "infrastructure"
  | "maintenance";

export interface TemplateIncidentOptions {
  incidentId: string;
  componentId: string;
  componentName: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  currentStatus: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  customDetail?: string;
  existingUpdates?: IncidentUpdate[];
}

interface TemplateConfig {
  title: (name: string) => string;
  messages: Record<IncidentStatus, (name: string, detail?: string) => string>;
}

const TEMPLATES: Record<IncidentCategory, TemplateConfig> = {
  core_service: {
    title: (name) => `${name} Processing Interruption`,
    messages: {
      investigating: (name) =>
        `Investigating: Elevated latency or request errors detected on ${name}. Automated failover and diagnostic routines are active.`,
      identified: (name) =>
        `Identified: Root cause isolated on ${name}. Engineering mitigations and traffic rebalancing are being applied.`,
      monitoring: (name) =>
        `Monitoring: Mitigations applied for ${name}. Service throughput and error rates are recovering to normal thresholds.`,
      resolved: (name) =>
        `Resolved: ${name} has fully recovered. All dispatch and translation pipelines are operating nominally.`,
    },
  },
  upstream_provider: {
    title: (name) => `Upstream Advisory: ${name}`,
    messages: {
      investigating: (name) =>
        `Notice: Upstream connectivity anomaly observed for ${name}. Subtitle translation requests are automatically routing through alternate providers.`,
      identified: (name) =>
        `Notice: Elevated error rates reported on upstream ${name} endpoints. Automated failover channels are maintaining translation availability.`,
      monitoring: (name) =>
        `Monitoring: Upstream status feeds indicate recovery underway for ${name}. Monitoring stability before restoring primary weight.`,
      resolved: (name) =>
        `Resolved: Upstream service health for ${name} has stabilized. Normal multi-provider routing has resumed.`,
    },
  },
  storage: {
    title: (name) => `${name} Intermittent Latency`,
    messages: {
      investigating: (name) =>
        `Investigating: Database connection latency observed. Non-blocking asynchronous queues are actively buffering requests.`,
      identified: (name) =>
        `Identified: Temporary database connection pool pressure. Automatic query backoff and connection re-establishment active.`,
      monitoring: (name) =>
        `Monitoring: Database response times stabilizing. Translation throughput remains unaffected.`,
      resolved: (name) =>
        `Resolved: Database connectivity and query latencies have returned to optimal performance.`,
    },
  },
  infrastructure: {
    title: (name) => `${name} Delivery Anomaly`,
    messages: {
      investigating: (name) =>
        `Investigating: Edge routing anomalies detected on ${name}. CDN failovers and edge retries are engaged.`,
      identified: (name) =>
        `Identified: Upstream routing bottleneck identified on ${name}. Traffic redirected to healthy edge points of presence.`,
      monitoring: (name) =>
        `Monitoring: Network routes stabilizing across all regions. Monitoring edge delivery performance.`,
      resolved: (name) =>
        `Resolved: Edge network delivery on ${name} has returned to full operational capacity.`,
    },
  },
  maintenance: {
    title: (name) => `Scheduled Maintenance: ${name}`,
    messages: {
      investigating: (name, detail) =>
        `Scheduled: Maintenance window planned for ${name}. ${detail || "Routine infrastructure upgrade."}`,
      identified: (name, detail) =>
        `Scheduled: Maintenance upcoming for ${name}. ${detail || "System optimizations scheduled."}`,
      monitoring: (name, detail) =>
        `In Progress: Scheduled maintenance for ${name} is actively underway. ${detail || ""}`,
      resolved: (name) =>
        `Completed: Scheduled maintenance for ${name} has completed successfully. All components verified nominal.`,
    },
  },
};

const STATUS_PROGRESSION: IncidentStatus[] = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];

export function buildIncidentFromTemplate(
  options: TemplateIncidentOptions,
): Incident {
  const {
    incidentId,
    componentId,
    componentName,
    category,
    severity,
    currentStatus,
    createdAt,
    updatedAt,
    customDetail,
    existingUpdates,
  } = options;

  const tmpl = TEMPLATES[category] || TEMPLATES.core_service;
  const title = tmpl.title(componentName);

  if (existingUpdates && existingUpdates.length > 0) {
    const lastUpdate = existingUpdates[existingUpdates.length - 1];
    if (lastUpdate.status === currentStatus) {
      return {
        id: incidentId,
        componentId,
        title,
        severity,
        status: currentStatus,
        createdAt,
        updatedAt,
        resolvedAt: currentStatus === "resolved" ? updatedAt : undefined,
        updates: existingUpdates,
      };
    }

    const newBody = tmpl.messages[currentStatus](componentName, customDetail);
    return {
      id: incidentId,
      componentId,
      title,
      severity,
      status: currentStatus,
      createdAt,
      updatedAt,
      resolvedAt: currentStatus === "resolved" ? updatedAt : undefined,
      updates: [
        ...existingUpdates,
        {
          timestamp: updatedAt,
          status: currentStatus,
          body: newBody,
        },
      ],
    };
  }

  const targetIdx = STATUS_PROGRESSION.indexOf(currentStatus);
  const stagesToInclude =
    category === "upstream_provider"
      ? [currentStatus]
      : targetIdx >= 0
        ? STATUS_PROGRESSION.slice(0, targetIdx + 1)
        : [currentStatus];

  const updates: IncidentUpdate[] = stagesToInclude.map((stage, idx) => {
    const ts = idx === stagesToInclude.length - 1 ? updatedAt : createdAt;
    return {
      timestamp: ts,
      status: stage,
      body: tmpl.messages[stage](componentName, customDetail),
    };
  });

  return {
    id: incidentId,
    componentId,
    title,
    severity,
    status: currentStatus,
    createdAt,
    updatedAt,
    resolvedAt: currentStatus === "resolved" ? updatedAt : undefined,
    updates,
  };
}
