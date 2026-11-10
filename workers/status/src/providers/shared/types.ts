import { ComponentStatus, WindowMetrics } from "../../types";
import { Env } from "../../config";

export interface ProviderIncident {
  id?: string;
  name: string;
  status?: string;
  impact?: string;
  url?: string;
  description?: string;
  components?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ProviderCoreImpact {
  affected: boolean;
  status: ComponentStatus;
  reason?: string;
}

type ProviderGroup = "translation_engines" | "infrastructure_dependencies";

export interface ProviderReport {
  id: string;
  name: string;
  group: ProviderGroup;
  status: ComponentStatus;
  referenceUrl?: string;
  activeIncidents?: ProviderIncident[];
  coreImpact?: ProviderCoreImpact;
  raw?: any;
}

export interface ProviderExecutionContext {
  windowMetrics: WindowMetrics;
  sharedState: Map<string, any>;
}

export interface ProviderIdentity {
  id: string;
  name: string;
  group: ProviderGroup;
  referenceUrl?: string;
}

export type ProviderOutcome = Pick<ProviderReport, "status" | "activeIncidents" | "coreImpact" | "raw">;

export interface StatusProvider extends ProviderIdentity {
  execute: (
    env: Env,
    context: ProviderExecutionContext,
  ) => Promise<ProviderReport>;
}
