import type { TranslationKey } from "../../i18n";
import * as lexiconDriver from "./lexicon/driver";
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
  driver: KindDriver;
}

export const MODEL_KINDS: Readonly<Record<ModelKind, ModelKindSpec>> = {
  ner: {
    labelKey: "models.kind.ner",
    titleKey: "models.kind.ner.title",
    descriptionKey: "models.kind.ner.description",
    legacyAdapter: "ner-wordpiece@1",
    driver: { prepare: nerDriver.ensureNerRuntime, release: nerDriver.disposeNerRuntime },
  },
  lexicon: {
    labelKey: "models.kind.lexicon",
    titleKey: "models.kind.lexicon.title",
    descriptionKey: "models.kind.lexicon.description",
    legacyAdapter: "lexicon-sets@1",
    driver: { prepare: lexiconDriver.ensureLexicon, release: lexiconDriver.disposeLexicon },
  },
};
