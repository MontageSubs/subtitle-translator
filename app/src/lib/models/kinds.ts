import type { TranslationKey } from "../../i18n";
import { checkModelCompatibility, type ModelIncompatibility } from "./compatibility";
import type { ModelKind } from "./types";

interface ModelKindSpec {
  labelKey: TranslationKey;
  check(): Promise<ModelIncompatibility | null>;
}

export const MODEL_KINDS: Readonly<Record<ModelKind, ModelKindSpec>> = {
  ner: { labelKey: "models.kind.ner", check: checkModelCompatibility },
};
