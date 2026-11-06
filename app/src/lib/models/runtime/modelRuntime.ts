import type { NerEntity } from "../ner/decode";
import * as nerDriver from "../ner/driver";
import { MODEL_KINDS } from "../kinds";
import type { ModelKind, ModelManifest } from "../types";
import { toModelError } from "./errors";

export { ModelError, type ModelErrorCode } from "./errors";

async function guarded<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw toModelError(error);
  }
}

export const prepareModel = (model: ModelManifest): Promise<void> => guarded(() => MODEL_KINDS[model.kind].driver.prepare(model));

export const activeBackend = nerDriver.activeNerBackend;

export const warmModel = (model: ModelManifest): void => void prepareModel(model).catch(() => undefined);

export const recognizeEntities = (units: readonly string[], signal: AbortSignal): Promise<NerEntity[][]> => guarded(() => nerDriver.recognizeUnits(units, signal));

export const releaseModels = (kind?: ModelKind): void => (kind ? [MODEL_KINDS[kind]] : Object.values(MODEL_KINDS)).forEach(({ driver }) => driver.release());
