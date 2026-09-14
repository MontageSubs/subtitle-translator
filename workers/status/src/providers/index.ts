import { Env } from "../index";
import {
  StatusProvider,
  ProviderReport,
  ProviderExecutionContext,
} from "./shared/types";
import { safeExecuteProvider } from "./shared/utils";

import { googlePaProvider } from "./googlePa";
import { googleV2Provider } from "./googleV2";
import { microsoftTranslatorProvider } from "./microsoftTranslator";
import { deeplApiProvider } from "./deeplApi";
import { cloudflareProvider } from "./cloudflare";
import { githubProvider } from "./github";
import { googleInfraProvider } from "./googleInfra";
import { azureInfraProvider } from "./azureInfra";
import { tursoProvider } from "./turso";

export * from "./shared/types";
export * from "./shared/utils";
export * from "./shared/googleCloud";

export const ALL_STATUS_PROVIDERS: StatusProvider[] = [
  googlePaProvider,
  googleV2Provider,
  microsoftTranslatorProvider,
  deeplApiProvider,
  cloudflareProvider,
  githubProvider,
  googleInfraProvider,
  azureInfraProvider,
  tursoProvider,
];

export const CORE_COMPONENT_IDS = [
  "service_availability",
  "core_infrastructure",
  "status_system",
];

export const MONITORED_COMPONENT_IDS = [
  ...CORE_COMPONENT_IDS,
  ...ALL_STATUS_PROVIDERS.map((p) => p.id),
];

export async function runAllProviders(
  env: Env,
  context: ProviderExecutionContext,
): Promise<ProviderReport[]> {
  return Promise.all(
    ALL_STATUS_PROVIDERS.map((provider) =>
      safeExecuteProvider(provider, env, context),
    ),
  );
}

export type ProviderPlugin = StatusProvider;
export const PROVIDER_PLUGINS = ALL_STATUS_PROVIDERS;
