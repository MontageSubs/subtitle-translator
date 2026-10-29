import type { TranslationKey } from "../../i18n";
import { checkModelCompatibility, type ModelIncompatibility } from "./compatibility";
import * as nerDriver from "./ner/driver";
import type { ModelKind, ModelManifest } from "./types";

export interface KindDriver {
  prepare(model: ModelManifest): Promise<void>;
  release(): void;
}

interface ModelKindSpec {
  labelKey: TranslationKey;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  legacyAdapter: string;
  check(): Promise<ModelIncompatibility | null>;
  driver: KindDriver;
}

export const MODEL_KINDS: Readonly<Record<ModelKind, ModelKindSpec>> = {
  ner: {
    labelKey: "models.kind.ner",
    titleKey: "models.kind.ner.title",
    descriptionKey: "models.kind.ner.description",
    legacyAdapter: "ner-wordpiece@1",
    check: checkModelCompatibility,
    driver: { prepare: nerDriver.ensureNerRuntime, release: nerDriver.disposeNerRuntime },
  },
};
