import type { NerEntity } from "../ner/decode";
import * as nerDriver from "../ner/driver";
import type { ModelKind, ModelManifest } from "../types";
import { toModelError } from "./errors";

export { ModelError, type ModelErrorCode } from "./errors";
export type RuntimeStatus = nerDriver.NerRuntimeStatus;

interface KindDriver {
  prepare(model: ModelManifest): Promise<void>;
  release(): void;
  status(): RuntimeStatus;
  subscribe(listener: () => void): () => void;
}

const DRIVERS: Readonly<Record<ModelKind, KindDriver>> = {
  ner: { prepare: nerDriver.ensureNerRuntime, release: nerDriver.disposeNerRuntime, status: nerDriver.nerRuntimeStatus, subscribe: nerDriver.subscribeNerRuntime },
};

async function guarded<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw toModelError(error);
  }
}

export const prepareModel = (model: ModelManifest): Promise<void> => guarded(() => DRIVERS[model.kind].prepare(model));

export const warmModel = (model: ModelManifest): void => void prepareModel(model).catch(() => undefined);

export const recognizeEntities = (units: readonly string[], signal: AbortSignal): Promise<NerEntity[][]> => guarded(() => nerDriver.recognizeUnits(units, signal));

export const releaseModels = (kind?: ModelKind): void => (kind ? [DRIVERS[kind]] : Object.values(DRIVERS)).forEach((driver) => driver.release());

export const runtimeStatus = (kind: ModelKind): RuntimeStatus => DRIVERS[kind].status();

export const subscribeRuntime = (kind: ModelKind, listener: () => void): (() => void) => DRIVERS[kind].subscribe(listener);
