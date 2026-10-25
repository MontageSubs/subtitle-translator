import type { ModelLimits, WorkerCapabilities } from "./types";

export const FALLBACK_MODEL_LIMITS: ModelLimits = { maxBatchChars: 8000, requestChars: 7200, subrequestLimit: 35, initialBatchCap: 28 };

export const FALLBACK_CAPABILITIES: WorkerCapabilities = { defaultModel: "", models: {} };

const isPositiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

function parseModelLimits(value: unknown): ModelLimits | null {
  const { maxBatchChars, requestChars, subrequestLimit, initialBatchCap } = (value ?? {}) as Record<string, unknown>;
  if (![maxBatchChars, requestChars, subrequestLimit, initialBatchCap].every(isPositiveInteger)) return null;
  return { maxBatchChars: maxBatchChars as number, requestChars: requestChars as number, subrequestLimit: subrequestLimit as number, initialBatchCap: initialBatchCap as number };
}

export function parseCapabilities(value: unknown): WorkerCapabilities | null {
  const { defaultModel, models } = (value ?? {}) as Record<string, unknown>;
  if (typeof defaultModel !== "string" || !models || typeof models !== "object") return null;
  const parsed: Record<string, ModelLimits> = {};
  for (const [id, limits] of Object.entries(models)) {
    const modelLimits = parseModelLimits(limits);
    if (modelLimits) parsed[id] = modelLimits;
  }
  return { defaultModel, models: parsed };
}

export function limitsForModel(capabilities: WorkerCapabilities, model: string | undefined): ModelLimits {
  return capabilities.models[model || capabilities.defaultModel] ?? FALLBACK_MODEL_LIMITS;
}
