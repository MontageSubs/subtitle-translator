import { createHash } from "node:crypto";
import type { DescribedFile } from "../hosting/localFile";

export const LEDGER_SCHEMA = 1;

export interface MirrorSource {
  url: string;
  fingerprint: string | null;
}

export interface MirrorFile extends DescribedFile {
  source: MirrorSource;
}

export interface MirrorModel {
  revision: string;
  updatedAt: string;
  files: Record<string, MirrorFile>;
}

export interface Ledger {
  schema: typeof LEDGER_SCHEMA;
  site: string;
  models: Record<string, MirrorModel>;
}

export const emptyLedger = (site: string): Ledger => ({ schema: LEDGER_SCHEMA, site, models: {} });

export function revisionOf(files: Record<string, MirrorFile>): string {
  const lines = Object.keys(files).sort().map((name) => `${name}:${files[name]!.sha256}`);
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 12);
}

export function parseLedger(text: string): Ledger | null {
  const parsed = JSON.parse(text) as Partial<Ledger>;
  if (parsed.schema !== LEDGER_SCHEMA) return null;
  if (typeof parsed.models !== "object" || parsed.models === null) throw new Error("registry.json is malformed");
  return parsed as Ledger;
}

export function serializeLedger(ledger: Ledger): string {
  const models = Object.fromEntries(
    Object.keys(ledger.models)
      .sort()
      .map((id) => {
        const { revision, updatedAt, files } = ledger.models[id]!;
        return [id, { revision, updatedAt, files: Object.fromEntries(Object.keys(files).sort().map((name) => [name, files[name]])) }];
      }),
  );
  return `${JSON.stringify({ schema: ledger.schema, site: ledger.site, models }, null, 2)}\n`;
}
