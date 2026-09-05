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

const OUR_ONGOING_MESSAGES = [
  "The issue is currently being fixed. Please check back later.",
  "We apologize for the inconvenience. The error is being actively addressed.",
  "Efforts are underway to restore normal service operations.",
  "A fix is in progress to resolve the disruption.",
  "We are actively working on returning the system to a healthy state.",
  "Service restoration is currently in progress.",
  "We are in the process of resolving this error.",
  "Active measures are being taken to stabilize the service.",
  "The system is currently undergoing repairs to fix the anomaly.",
  "We are actively mitigating the issue to restore full functionality.",
  "Work is ongoing to clear the error state. Thanks for your patience.",
  "A resolution is actively being implemented for this disruption.",
  "We are currently addressing the root cause to bring services back online.",
  "System recovery efforts are actively progressing.",
  "The disruption is being actively handled and a fix is on the way."
];

const UPSTREAM_ONGOING_MESSAGES = [
  "The issue is acknowledged and we are waiting for the upstream provider to resolve it.",
  "The issue is acknowledged and relevant mitigation measures are being applied.",
  "We are monitoring the upstream service closely while they address the outage.",
  "Awaiting upstream resolution to fully restore this component.",
  "The upstream provider is currently working on fixing the disruption.",
  "We are dependent on the upstream provider's recovery efforts at this time.",
  "Monitoring upstream status updates as they work towards a fix.",
  "Mitigation strategies are active while we wait for upstream restoration.",
  "The issue is known and depends on an upstream provider's resolution.",
  "Awaiting a fix from the external service provider.",
  "The upstream infrastructure is currently degraded, pending their internal fixes.",
  "We are tracking the upstream provider's progress on resolving this anomaly.",
  "External dependencies are actively being monitored for recovery.",
  "The upstream provider has acknowledged the fault and is working on a resolution.",
  "Service will resume normal operations once the upstream provider clears the error."
];

const RESOLVED_MESSAGES = [
  "This specific issue has been successfully resolved.",
  "Normal operations for this component have resumed.",
  "The disruption related to this service has been fully addressed.",
  "Automated systems have confirmed that this issue is resolved.",
  "We believe this issue has been resolved. If you still encounter errors, please let us know via the issue tracker.",
  "Automated checks indicate that this component has recovered.",
  "This disruption appears to be resolved. Please report an issue if you continue to experience problems.",
  "Service for this specific component has been restored.",
  "The error state for this service has cleared, as confirmed by automated systems.",
  "We consider this specific problem resolved. Feel free to submit feedback if anything seems off."
];

function getRandomMessage(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

const TEMPLATES: Record<IncidentCategory, TemplateConfig> = {
  core_service: {
    title: (name) => `Automated Alert: ${name} Interruption`,
    messages: {
      investigating: (name) =>
        `Investigating: We detected a failure in ${name}, which may impact subtitle translation services.`,
      identified: (name) =>
        `Identified: Automated systems confirm an ongoing disruption with ${name}.`,
      monitoring: () => `Monitoring: ${getRandomMessage(OUR_ONGOING_MESSAGES)}`,
      resolved: () => `Resolved: ${getRandomMessage(RESOLVED_MESSAGES)}`,
    },
  },
  upstream_provider: {
    title: (name) => `Automated Alert: ${name} Reachability`,
    messages: {
      investigating: (name) =>
        `Investigating: Automated systems detected a connectivity anomaly with the upstream provider ${name}.`,
      identified: (name) =>
        `Identified: An ongoing fault has been confirmed with the upstream provider ${name}.`,
      monitoring: () => `Monitoring: ${getRandomMessage(UPSTREAM_ONGOING_MESSAGES)}`,
      resolved: () => `Resolved: ${getRandomMessage(RESOLVED_MESSAGES)}`,
    },
  },
  storage: {
    title: (name) => `Automated Alert: ${name} Latency`,
    messages: {
      investigating: (name) =>
        `Investigating: We detected a failure in ${name}, which may impact database availability.`,
      identified: (name) =>
        `Identified: Automated systems confirm an ongoing database connectivity issue on ${name}.`,
      monitoring: () => `Monitoring: ${getRandomMessage(OUR_ONGOING_MESSAGES)}`,
      resolved: () => `Resolved: ${getRandomMessage(RESOLVED_MESSAGES)}`,
    },
  },
  infrastructure: {
    title: (name) => `Automated Alert: ${name} Delivery Anomaly`,
    messages: {
      investigating: (name) =>
        `Investigating: Automated systems detected an edge delivery disruption involving ${name}.`,
      identified: (name) =>
        `Identified: An ongoing infrastructure routing bottleneck has been confirmed on ${name}.`,
      monitoring: () => `Monitoring: ${getRandomMessage(OUR_ONGOING_MESSAGES)}`,
      resolved: () => `Resolved: ${getRandomMessage(RESOLVED_MESSAGES)}`,
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
        `Completed: Scheduled maintenance for ${name} has completed successfully.`,
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
        updatedAt,
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
