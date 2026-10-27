import { checkModelCompatibility, type ModelIncompatibility } from "./compatibility";
import type { ModelKind } from "./types";

interface ModelKindSpec {
  check(): Promise<ModelIncompatibility | null>;
}

export const MODEL_KINDS: Readonly<Record<ModelKind, ModelKindSpec>> = {
  ner: { check: checkModelCompatibility },
};
