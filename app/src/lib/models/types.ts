import type { TranslationKey } from "../../i18n";

export type ModelKind = "ner";

export interface ModelFileSpec {
  name: string;
  path: string;
  sha256?: string;
}

export interface ModelRuntime {
  format: "onnx";
  providers: readonly string[];
}

export interface ModelManifest {
  schema: 1;
  id: string;
  kind: ModelKind;
  version: string;
  nameKey: TranslationKey;
  descriptionKey: TranslationKey;
  author: string;
  repository: string;
  upstreamRepository?: string;
  revision: string;
  languages: readonly string[];
  sizeHint: number;
  files: readonly ModelFileSpec[];
  roles: Readonly<Record<string, string>>;
  runtime: ModelRuntime;
  packageUrl?: string;
}

export interface ModelRecord {
  version: string;
  installedAt: number;
  bytes: number;
  revision?: string;
  origin: "cloud" | "manual";
  enabled: boolean;
  hashes: Readonly<Record<string, string>>;
}

export type ModelFailure = "network" | "integrity" | "unavailable" | "storage" | "archive" | "missing" | "mismatch";
