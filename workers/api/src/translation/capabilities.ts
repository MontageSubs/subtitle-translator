import type { Env } from "../config/env";
import { settingsFor } from "../config/settings";
import { getOrInsert } from "../support/getOrInsert";
import { SUBREQUEST_LIMIT, initialDispatchCap } from "./engine/budget";
import { DEFAULT_PROVIDER, getProvider, providerIds } from "./providers/registry";

export interface ModelLimits {
  maxBatchChars: number;
  requestChars: number;
  subrequestLimit: number;
  initialBatchCap: number;
}

export interface WorkerCapabilities {
  defaultModel: string;
  maxCuesPerRequest: number;
  models: Record<string, ModelLimits>;
}

export function limitsFor(env: Env, providerName: string): ModelLimits {
  const settings = settingsFor(env);
  const override = settings.providerLimits[providerName];
  const maxBatchChars = override?.maxBatchChars ?? settings.maxBatchChars;
  const subrequestLimit = override?.subrequestLimit ?? SUBREQUEST_LIMIT;
  return {
    maxBatchChars,
    requestChars: getProvider(providerName).requestChars(maxBatchChars),
    subrequestLimit,
    initialBatchCap: initialDispatchCap(subrequestLimit),
  };
}

const cache = new WeakMap<Env, WorkerCapabilities>();

export function capabilitiesFor(env: Env): WorkerCapabilities {
  return getOrInsert(cache, env, () => ({
    defaultModel: env.TRANSLATION_PROVIDER || DEFAULT_PROVIDER,
    maxCuesPerRequest: settingsFor(env).maxCuesPerRequest,
    models: Object.fromEntries(providerIds().map((id) => [id, limitsFor(env, id)])),
  }));
}
