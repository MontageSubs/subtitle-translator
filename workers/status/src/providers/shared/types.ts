import { ComponentStatus, WindowMetrics } from "../../types";
import { Env } from "../../index";

export interface ProviderIncident {
  id: string;
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

export interface ProviderReport {
  id: string;
  name: string;
  group: "translation_engines" | "infrastructure_dependencies" | "core_services";
  status: ComponentStatus;
  referenceUrl?: string;
  activeIncidents?: ProviderIncident[];
  coreImpact?: ProviderCoreImpact;
  raw?: any;
}

export interface ProviderExecutionContext {
  windowMetrics: WindowMetrics;
  sharedState: Map<string, any>;
  mainSiteUrl: string;
  statusUrl: string;
}

export interface StatusProvider {
  id: string;
  name: string;
  group: "translation_engines" | "infrastructure_dependencies" | "core_services";
  referenceUrl?: string;
  execute: (
    env: Env,
    context: ProviderExecutionContext,
  ) => Promise<ProviderReport>;
}
