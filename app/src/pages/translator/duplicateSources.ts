import type { RawSource } from "../../lib/subtitle/archive";

export interface DuplicateNotice {
  skipped: string;
  keptAs: string;
}

export interface DuplicatePartition {
  unique: RawSource[];
  notices: DuplicateNotice[];
}

export interface QueuedSource {
  relativePath: string;
  bytes: Uint8Array;
}

async function digestOf(bytes: Uint8Array): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const byName = (a: RawSource, b: RawSource): number => a.name.localeCompare(b.name) || a.relativePath.localeCompare(b.relativePath);

export async function partitionDuplicates(incoming: RawSource[], queued: QueuedSource[]): Promise<DuplicatePartition> {
  const [queuedDigests, incomingDigests] = await Promise.all([
    Promise.all(queued.map((source) => digestOf(source.bytes))),
    Promise.all(incoming.map((source) => digestOf(source.bytes))),
  ]);
  const owners = new Map<string, string>();
  queued.forEach((source, index) => {
    const digest = queuedDigests[index];
    if (digest && !owners.has(digest)) owners.set(digest, source.relativePath);
  });

  const digestBySource = new Map(incoming.map((source, index) => [source, incomingDigests[index]]));
  const kept = new Set<RawSource>();
  const notices: DuplicateNotice[] = [];
  for (const source of [...incoming].sort(byName)) {
    const digest = digestBySource.get(source);
    const owner = digest ? owners.get(digest) : undefined;
    if (digest && owner === undefined) owners.set(digest, source.relativePath);
    if (owner === undefined) kept.add(source);
    else notices.push({ skipped: source.relativePath, keptAs: owner });
  }
  return { unique: incoming.filter((source) => kept.has(source)), notices };
}
