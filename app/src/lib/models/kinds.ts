import type { TranslationKey } from "../../i18n";
import { checkModelCompatibility, type ModelIncompatibility } from "./compatibility";
import type { ModelKind } from "./types";

interface ModelKindSpec {
  labelKey: TranslationKey;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  legacyAdapter: string;
  check(): Promise<ModelIncompatibility | null>;
}

export const MODEL_KINDS: Readonly<Record<ModelKind, ModelKindSpec>> = {
  ner: { labelKey: "models.kind.ner", titleKey: "models.kind.ner.title", descriptionKey: "models.kind.ner.description", legacyAdapter: "ner-wordpiece@1", check: checkModelCompatibility },
};
