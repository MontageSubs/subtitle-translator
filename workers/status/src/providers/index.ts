import { Env } from "../index";
import { ComponentStatus, WindowMetrics } from "../types";

export interface ProviderContext {
  windowMetrics: WindowMetrics;
  sharedState: Map<string, any>;
}

export interface ProviderPlugin {
  id: string;
  name: string;
  group: "translation_engines" | "infrastructure_dependencies";
  referenceUrl?: string;

  preFetch?: (env: Env, sharedState: Map<string, any>) => Promise<void>;
  check: (env: Env, sharedState: Map<string, any>) => Promise<any>;
  evaluate: (checkResult: any, context: ProviderContext) => ComponentStatus;
}

import { googlePaPlugin } from "./googlePa";
import { googleV2Plugin } from "./googleV2";
import { microsoftTranslatorPlugin } from "./microsoftTranslator";
import { deeplApiPlugin } from "./deeplApi";
import { cloudflarePlugin } from "./cloudflare";
import { githubPlugin } from "./github";
import { googleInfraPlugin } from "./googleInfra";
import { azureInfraPlugin } from "./azureInfra";

export const PROVIDER_PLUGINS: ProviderPlugin[] = [
  googlePaPlugin,
  googleV2Plugin,
  microsoftTranslatorPlugin,
  deeplApiPlugin,
  cloudflarePlugin,
  githubPlugin,
  googleInfraPlugin,
  azureInfraPlugin,
];

export const CORE_COMPONENT_IDS = [
  "service_availability",
  "core_infrastructure",
  "status_system",
  "upstream_storage",
];

export const MONITORED_COMPONENT_IDS = [
  ...CORE_COMPONENT_IDS,
  ...PROVIDER_PLUGINS.map((p) => p.id),
];
