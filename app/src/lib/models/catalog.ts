import type { ModelKind, ModelManifest } from "./types";

const NER_REPOSITORY = "Xenova/bert-base-multilingual-cased-ner-hrl";
const NER_REVISION = "263e82c06569c8c2ac46238a7ae5107598934234";
const DISTIL_REPOSITORY = "Xenova/distilbert-base-multilingual-cased-ner-hrl";
const DISTIL_REVISION = "c2a4dbf593c57f47004c5bc2d3770d311aee9c43";
const NER_LANGUAGES = ["en", "de", "es", "fr", "it", "nl", "pt", "lv", "zh", "ar"] as const;
const nerFile = (name: string, path: string) => ({ name, path });
const nerFiles = () => [nerFile("model.onnx", "onnx/model_quantized.onnx"), nerFile("config.json", "config.json"), nerFile("vocab.txt", "vocab.txt")];

export const MODEL_CATALOG: readonly ModelManifest[] = [
  {
    schema: 1,
    id: "ner-multilingual-hrl",
    kind: "ner",
    version: "1",
    descriptionKey: "models.catalog.nerMultilingual.description",
    author: "Davlan · Xenova",
    repository: NER_REPOSITORY,
    revision: NER_REVISION,
    languages: NER_LANGUAGES,
    sizeHint: 180_000_000,
    files: nerFiles(),
    roles: { model: "model.onnx", config: "config.json", vocabulary: "vocab.txt" },
    runtime: { format: "onnx", providers: ["wasm"] },
  },
  {
    schema: 1,
    id: "ner-distilbert-multilingual-hrl",
    kind: "ner",
    version: "1",
    descriptionKey: "models.catalog.nerDistilMultilingual.description",
    author: "Davlan · Xenova",
    repository: DISTIL_REPOSITORY,
    revision: DISTIL_REVISION,
    languages: NER_LANGUAGES,
    sizeHint: 135_000_000,
    files: nerFiles(),
    roles: { model: "model.onnx", config: "config.json", vocabulary: "vocab.txt" },
    runtime: { format: "onnx", providers: ["wasm"] },
  },
];

export const findModel = (id: string): ModelManifest | undefined => MODEL_CATALOG.find((model) => model.id === id);

export const modelsOfKind = (kind: ModelKind): readonly ModelManifest[] => MODEL_CATALOG.filter((model) => model.kind === kind);

export const modelAnchor = (model: ModelManifest): string => model.repository.split("/").pop()!.toLowerCase();

export const findModelByAnchor = (anchor: string): ModelManifest | undefined => MODEL_CATALOG.find((model) => modelAnchor(model) === anchor.toLowerCase());
