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
  componentId: string | string[];
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

const ONGOING_OUTAGE_MESSAGES = [
  "Our automated diagnostics continue to observe anomalies. The system remains in a degraded state pending human review.",
  "The automated monitoring system confirms the issue is still present. Relevant telemetry has been preserved for manual investigation.",
  "Service interruptions are still being automatically detected. Human operators will review the collected logs.",
  "No changes in the current degraded status. The automated system is continuously tracking the failure conditions.",
  "The issue persists according to our automated health checks. Standard fallback mechanisms remain active.",
  "Automated probes continue to report errors. We are awaiting human intervention to perform deeper diagnostics.",
  "The situation remains unchanged. Our automated systems are actively collecting error traces for future review.",
  "System degradation is still being automatically registered. No manual resolution has been applied yet.",
  "Our automated infrastructure continues to detect service instability. Telemetry data is safely archived for human analysis.",
  "The automated alert remains active. Service metrics have not yet returned to normal operational thresholds.",
  "Continuous automated polling confirms the ongoing outage. System logs are queued for operator inspection.",
  "The fault condition is still being automatically recognized. Further actions will depend on human operator assessment.",
  "Automated monitoring continues to report non-nominal behavior. Fallback routing is maintained where applicable.",
  "The anomaly is still present in automated health reports. We are holding this status until manual clearance.",
  "Our automated sensors confirm the service remains affected. Human investigation is pending."
];

function getRandomOngoingMessage(): string {
  return ONGOING_OUTAGE_MESSAGES[Math.floor(Math.random() * ONGOING_OUTAGE_MESSAGES.length)];
}

const TEMPLATES: Record<IncidentCategory, TemplateConfig> = {
  core_service: {
    title: (name) => `Automated Alert: ${name} Interruption`,
    messages: {
      investigating: (name) =>
        `Investigating: Our automated systems have detected an anomaly with ${name}. Traffic routing and diagnostic data collection have been automatically initiated.`,
      identified: (name) =>
        `Identified: The automated system has confirmed the persistence of the issue on ${name}. The anomaly has been formally registered for human operator review.`,
      monitoring: () => `Monitoring: ${getRandomOngoingMessage()}`,
      resolved: (name) =>
        `Resolved: Our automated systems have verified that ${name} has recovered. Normal operational metrics have been restored.`,
    },
  },
  upstream_provider: {
    title: (name) => `Automated Alert: ${name} Reachability`,
    messages: {
      investigating: (name) =>
        `Investigating: Automated probes detected a connectivity or response anomaly with the upstream provider ${name}. Alternate routing is being attempted automatically.`,
      identified: (name) =>
        `Identified: The automated system confirms persistent elevated error rates from ${name}. The event is logged for human operators to review.`,
      monitoring: () => `Monitoring: ${getRandomOngoingMessage()}`,
      resolved: (name) =>
        `Resolved: Automated health checks verify that upstream provider ${name} has stabilized. Multi-provider routing has automatically resumed.`,
    },
  },
  storage: {
    title: (name) => `Automated Alert: ${name} Latency`,
    messages: {
      investigating: (name) =>
        `Investigating: Automated metrics indicate latency or connection pressure on ${name}. Non-blocking asynchronous queues are automatically buffering requests.`,
      identified: (name) =>
        `Identified: The automated system recognizes persistent database connectivity anomalies on ${name}. The incident is queued for human inspection.`,
      monitoring: () => `Monitoring: ${getRandomOngoingMessage()}`,
      resolved: (name) =>
        `Resolved: Automated systems confirm that database connectivity and query latencies on ${name} have returned to optimal performance.`,
    },
  },
  infrastructure: {
    title: (name) => `Automated Alert: ${name} Delivery Anomaly`,
    messages: {
      investigating: (name) =>
        `Investigating: Automated edge routing sensors detected delivery anomalies on ${name}. CDN retries are automatically engaged.`,
      identified: (name) =>
        `Identified: The automated system confirms an ongoing upstream routing bottleneck on ${name}. The event has been logged for manual review.`,
      monitoring: () => `Monitoring: ${getRandomOngoingMessage()}`,
      resolved: (name) =>
        `Resolved: Our automated systems confirm edge network delivery on ${name} has returned to full operational capacity.`,
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
        `Completed: Scheduled maintenance for ${name} has completed successfully. `,
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
      // 45 minutes = 2700000 ms
      const msSinceLast = new Date(updatedAt).getTime() - new Date(lastUpdate.timestamp).getTime();
      if (
        currentStatus === "monitoring" &&
        category !== "maintenance" &&
        msSinceLast > 2700000
      ) {
        const newBody = tmpl.messages[currentStatus](componentName, customDetail);
        return {
          id: incidentId,
          componentId,
          title,
          severity,
          status: currentStatus,
          createdAt,
          updatedAt,
          resolvedAt: undefined,
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

      return {
        id: incidentId,
        componentId,
        title,
        severity,
        status: currentStatus,
        createdAt,
        updatedAt, // keep previous updatedAt, or advance it? Advance it to show it was checked.
        resolvedAt: undefined,
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
      resolvedAt: undefined,
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
    resolvedAt: undefined,
    updates,
  };
}
