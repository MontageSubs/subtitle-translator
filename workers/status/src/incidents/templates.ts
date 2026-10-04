import {
  Incident,
  IncidentStatus,
  IncidentUpdate,
  IncidentSeverity,
} from "../types";
import { generateMessageId, generateUnifiedIncidentId } from "./ids";
import { deriveResolvedAt, normalizeId } from "./utils";

export type IncidentCategory = "upstream_provider" | "infrastructure";

export interface TemplateIncidentOptions {
  incidentId?: string;
  componentId: string | string[];
  componentName?: string;
  title?: string;
  category: IncidentCategory;
  severity?: IncidentSeverity;
  currentStatus: IncidentStatus;
  createdAt?: string;
  updatedAt?: string;
  customDetail?: string;
  upstreamIds?: string[];
  existingUpdates?: IncidentUpdate[];
}

interface TemplateConfig {
  title: (name: string) => string;
  messages: Record<IncidentStatus, (name: string, detail?: string) => string>;
}

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

function upstreamNotice(_name: string, detail?: string): string {
  return `Automated systems detected a related issue${detail ? ` (Upstream ID: ${detail})` : ""}. We will continuously monitor and evaluate the impact on our services. We will provide updates if there is further progress.`;
}

const TEMPLATES: Record<IncidentCategory, TemplateConfig> = {
  upstream_provider: {
    title: (name) => `Automated Alert: ${name} Reachability`,
    messages: {
      investigating: upstreamNotice,
      identified: upstreamNotice,
      monitoring: upstreamNotice,
      resolved: () => `Resolved: The upstream provider has successfully resolved the issue.`,
    },
  },
  infrastructure: {
    title: (name) => `Automated Alert: ${name} Delivery Anomaly`,
    messages: {
      investigating: (name) =>
        `Investigating: Automated systems detected an edge delivery disruption involving ${name}.`,
      identified: (name) =>
        `Identified: An ongoing infrastructure routing bottleneck has been confirmed on ${name}.`,
      monitoring: () => `Monitoring: ${getRandomMessage(UPSTREAM_ONGOING_MESSAGES)}`,
      resolved: () => `Resolved: ${getRandomMessage(RESOLVED_MESSAGES)}`,
    },
  },
};

const STATUS_PROGRESSION: IncidentStatus[] = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];

const MANUAL_DEFAULT_MESSAGE: Record<IncidentStatus, string> = {
  investigating: "This issue has been manually reported by our team and is under investigation.",
  identified: "The cause has been identified and a fix is being worked on.",
  monitoring: "A fix has been applied and we are monitoring the results.",
  resolved: "This issue has been resolved.",
};

export function ensureUpdateIds(updates: IncidentUpdate[] = []): IncidentUpdate[] {
  if (!Array.isArray(updates)) return [];
  return updates.filter(Boolean).map((u) => ({
    ...u,
    id: normalizeId(u.id) || generateMessageId(),
  }));
}

export function buildManualIncident(options: {
  incidentId?: string;
  componentId: string | string[];
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt?: string;
  updatedAt?: string;
  message?: string;
  base?: Incident;
}): Incident {
  const createdAt = options.createdAt || new Date().toISOString();
  const updatedAt = options.updatedAt || createdAt;
  const updates: IncidentUpdate[] = [
    ...ensureUpdateIds(options.base?.updates),
    {
      id: generateMessageId(),
      author: "human",
      timestamp: updatedAt,
      status: options.status,
      body: options.message?.trim() || MANUAL_DEFAULT_MESSAGE[options.status],
    },
  ];

  return {
    ...(options.base ?? { manual: true as const }),
    id: normalizeId(options.incidentId) || generateUnifiedIncidentId(createdAt),
    componentId: options.componentId,
    title: options.title,
    severity: options.severity,
    status: options.status,
    createdAt,
    updatedAt,
    resolvedAt: deriveResolvedAt(updates),
    updates,
  };
}

export function buildIncidentFromTemplate(
  options: TemplateIncidentOptions,
): Incident {
  const { componentId, currentStatus: status, customDetail } = options;
  const createdAt = options.createdAt || new Date().toISOString();
  const updatedAt = options.updatedAt || createdAt;
  const componentName =
    options.componentName ||
    (Array.isArray(componentId) ? componentId[0] : componentId) ||
    "Core Service";
  const tmpl = TEMPLATES[options.category];
  const previous = ensureUpdateIds(options.existingUpdates);
  const makeUpdate = (stage: IncidentStatus, timestamp: string): IncidentUpdate => ({
    id: generateMessageId(),
    author: "auto",
    timestamp,
    status: stage,
    body: tmpl.messages[stage](componentName, customDetail),
  });

  let updates = previous;
  if (previous.length > 0) {
    if (previous[previous.length - 1].status !== status) {
      updates = [...previous, makeUpdate(status, updatedAt)];
    }
  } else {
    const progressionEnd = STATUS_PROGRESSION.indexOf(status);
    const stages =
      options.category === "upstream_provider" || progressionEnd < 0
        ? [status]
        : STATUS_PROGRESSION.slice(0, progressionEnd + 1);
    updates = stages.map((stage, idx) =>
      makeUpdate(stage, idx === stages.length - 1 ? updatedAt : createdAt),
    );
  }

  return {
    id: normalizeId(options.incidentId) || generateUnifiedIncidentId(createdAt),
    componentId,
    title: options.title || tmpl.title(componentName),
    severity: options.severity || "minor",
    status,
    createdAt,
    updatedAt,
    resolvedAt: deriveResolvedAt(updates),
    ...(options.upstreamIds?.length ? { upstreamIds: options.upstreamIds } : {}),
    updates,
  };
}
