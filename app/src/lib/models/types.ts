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
  descriptionKey: TranslationKey;
  author: string;
  repository: string;
  revision: string;
  languages: readonly string[];
  sizeHint: number;
  files: readonly ModelFileSpec[];
  roles: Readonly<Record<string, string>>;
  runtime: ModelRuntime;
  deprecated?: boolean;
  packageUrl?: string;
}

export interface ModelRecord {
  version: string;
  installedAt: number;
  bytes: number;
  revision?: string;
  updated?: boolean;
  origin: "cloud" | "manual";
  enabled: boolean;
  hashes: Readonly<Record<string, string>>;
}

export type ModelFailure = "network" | "integrity" | "unavailable" | "storage" | "archive" | "missing" | "mismatch";
