export const MODEL_KIND_IDS = ["ner", "lexicon"] as const;
export const MODEL_PROVIDERS = ["wasm", "webgl", "webgpu"] as const;
export const MODEL_DELIVERIES = ["fetch", "manual"] as const;
export const MODEL_USE_RULES = ["always", "script-differs"] as const;

export type ModelKind = (typeof MODEL_KIND_IDS)[number];
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];
type ModelDelivery = (typeof MODEL_DELIVERIES)[number];
export type ModelUseRule = (typeof MODEL_USE_RULES)[number];

export interface ModelFileSpec {
  name: string;
  urls?: readonly string[];
  sha256?: string;
  backend?: string;
}

interface ModelPackage {
  url: string;
  sha256?: string;
}

interface ModelRuntime {
  format: "onnx" | "json";
  adapter: string;
  providers: readonly ModelProvider[];
}

export interface ModelManifest {
  schema: 1;
  id: string;
  kind: ModelKind;
  name: string;
  version: string;
  description: Readonly<Record<string, string>>;
  author: string;
  homepage: string;
  delivery: ModelDelivery;
  languages: readonly string[];
  sizeHint: number;
  files: readonly ModelFileSpec[];
  package?: ModelPackage;
  roles: Readonly<Record<string, string>>;
  runtime: ModelRuntime;
  useWhen?: ModelUseRule;
  companions?: readonly string[];
  deprecated?: boolean;
}

export interface ModelRecord {
  version: string;
  installedAt: number;
  bytes: number;
  updated?: boolean;
  origin: "download" | "upload";
  adapter?: string;
  enabled: boolean;
  hashes: Readonly<Record<string, string>>;
}

export type ModelFailure = "network" | "integrity" | "unavailable" | "storage" | "archive" | "missing" | "mismatch";
