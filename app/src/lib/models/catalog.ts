import type { ModelKind, ModelManifest } from "./types";

const NER_REPOSITORY = "Xenova/bert-base-multilingual-cased-ner-hrl";
const NER_REVISION = "263e82c06569c8c2ac46238a7ae5107598934234";
const DISTIL_REPOSITORY = "Xenova/distilbert-base-multilingual-cased-ner-hrl";
const DISTIL_REVISION = "c2a4dbf593c57f47004c5bc2d3770d311aee9c43";
const JAPANESE_REPOSITORY = "jiting/xlm-roberta-ner-japanese_onnx";
const JAPANESE_REVISION = "55ddfbe9a13d18a4d6f985f31f443e30b3f3da47";
const NER_LANGUAGES = ["en", "de", "es", "fr", "it", "nl", "pt", "lv", "zh", "ar"] as const;
const WORDPIECE_ADAPTER = "ner-wordpiece@1";
const UNIGRAM_ADAPTER = "ner-unigram@1";
const nerFile = (name: string, path: string) => ({ name, path });
const nerFiles = () => [nerFile("model.onnx", "onnx/model_quantized.onnx"), nerFile("config.json", "config.json"), nerFile("vocab.txt", "vocab.txt")];

export const MODEL_CATALOG: readonly ModelManifest[] = [
  {
    schema: 1,
    id: "ner-multilingual-hrl",
    kind: "ner",
    name: "BERT multilingual NER",
    version: "1",
    descriptionKey: "models.catalog.nerMultilingual.description",
    author: "Davlan · Xenova",
    repository: NER_REPOSITORY,
    revision: NER_REVISION,
    languages: NER_LANGUAGES,
    sizeHint: 180_000_000,
    files: nerFiles(),
    roles: { model: "model.onnx", config: "config.json", vocabulary: "vocab.txt" },
    runtime: { format: "onnx", adapter: WORDPIECE_ADAPTER, providers: ["wasm"] },
  },
  {
    schema: 1,
    id: "ner-distilbert-multilingual-hrl",
    kind: "ner",
    name: "DistilBERT multilingual NER",
    version: "1",
    descriptionKey: "models.catalog.nerDistilMultilingual.description",
    author: "Davlan · Xenova",
    repository: DISTIL_REPOSITORY,
    revision: DISTIL_REVISION,
    languages: NER_LANGUAGES,
    sizeHint: 135_000_000,
    files: nerFiles(),
    roles: { model: "model.onnx", config: "config.json", vocabulary: "vocab.txt" },
    runtime: { format: "onnx", adapter: WORDPIECE_ADAPTER, providers: ["wasm"] },
  },
  {
    schema: 1,
    id: "ner-xlmr-japanese",
    kind: "ner",
    name: "XLM-RoBERTa Japanese NER",
    version: "1",
    descriptionKey: "models.catalog.nerJapanese.description",
    author: "tsmatz · jiting",
    repository: JAPANESE_REPOSITORY,
    revision: JAPANESE_REVISION,
    languages: ["ja"],
    sizeHint: 297_000_000,
    files: [nerFile("model.onnx", "onnx/model_quantized.onnx"), nerFile("config.json", "config.json"), nerFile("tokenizer.json", "tokenizer.json")],
    roles: { model: "model.onnx", config: "config.json", tokenizer: "tokenizer.json" },
    runtime: { format: "onnx", adapter: UNIGRAM_ADAPTER, providers: ["wasm"] },
  },
];

export const findModel = (id: string): ModelManifest | undefined => MODEL_CATALOG.find((model) => model.id === id);

export const modelsOfKind = (kind: ModelKind): readonly ModelManifest[] => MODEL_CATALOG.filter((model) => model.kind === kind);

export const modelAnchor = (model: ModelManifest): string => model.repository.split("/").pop()!.toLowerCase();

export const findModelByAnchor = (anchor: string): ModelManifest | undefined => MODEL_CATALOG.find((model) => modelAnchor(model) === anchor.toLowerCase());
