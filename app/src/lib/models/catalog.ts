import type { ModelKind, ModelManifest } from "./types";

const NER_REPOSITORY = "Xenova/bert-base-multilingual-cased-ner-hrl";
const NER_REVISION = "263e82c06569c8c2ac46238a7ae5107598934234";
const nerFile = (name: string, path: string) => ({ name, path });

export const MODEL_CATALOG: readonly ModelManifest[] = [
  {
    schema: 1,
    id: "ner-multilingual-hrl",
    kind: "ner",
    version: "1",
    nameKey: "models.catalog.nerMultilingual.name",
    descriptionKey: "models.catalog.nerMultilingual.description",
    author: "Davlan · Xenova",
    repository: NER_REPOSITORY,
    upstreamRepository: "Davlan/bert-base-multilingual-cased-ner-hrl",
    revision: NER_REVISION,
    languages: ["en", "de", "es", "fr", "it", "nl", "pt", "lv", "zh", "ar"],
    sizeHint: 180_000_000,
    files: [nerFile("model.onnx", "onnx/model_quantized.onnx"), nerFile("config.json", "config.json"), nerFile("vocab.txt", "vocab.txt")],
    roles: { model: "model.onnx", config: "config.json", vocabulary: "vocab.txt" },
    runtime: { format: "onnx", providers: ["wasm"] },
  },
];

export const findModel = (id: string): ModelManifest | undefined => MODEL_CATALOG.find((model) => model.id === id);

export const modelsOfKind = (kind: ModelKind): readonly ModelManifest[] => MODEL_CATALOG.filter((model) => model.kind === kind);
