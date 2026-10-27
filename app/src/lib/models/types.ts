import type { TranslationKey } from "../../i18n";

export type ModelKind = "ner";

export interface ModelFileSpec {
  name: string;
  url: string;
  sha256?: string;
}

export interface ModelManifest {
  schema: 1;
  id: string;
  kind: ModelKind;
  version: string;
  nameKey: TranslationKey;
  descriptionKey: TranslationKey;
  author: string;
  languages: readonly string[];
  sizeHint: number;
  files: readonly ModelFileSpec[];
  roles: Readonly<Record<string, string>>;
  packageUrl?: string;
}

export interface ModelRecord {
  version: string;
  installedAt: number;
  bytes: number;
  origin: "cloud" | "manual";
  enabled: boolean;
  hashes: Readonly<Record<string, string>>;
}

export type ModelFailure = "network" | "integrity" | "unavailable" | "storage" | "archive" | "missing" | "mismatch";
