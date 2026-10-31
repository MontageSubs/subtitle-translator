import { PRODUCTION_CHANNEL, type ChannelId } from "../src/config/channelProfile";

export const REGISTRY_SCHEMA = 2;

export interface RegistryPart {
  bytes: number;
  sha256: string;
  pages: string;
}

export interface RegistryFile {
  bytes: number;
  sha256: string;
  parts: RegistryPart[];
  origin?: string;
}

export interface ChannelUse {
  since: string;
  until: string | null;
}

export interface RegistryArtifact {
  files: Record<string, RegistryFile>;
  channels: Partial<Record<ChannelId, ChannelUse>>;
}

export interface Registry {
  schema: typeof REGISTRY_SCHEMA;
  site: string;
  artifacts: Record<string, RegistryArtifact>;
}

export interface SightedArtifact {
  key: string;
  files: Record<string, RegistryFile>;
}

export interface Sighting {
  channel: ChannelId;
  appVersion: string;
  artifacts: SightedArtifact[];
}

export interface RetentionPolicy {
  minimumProductionApp: string;
  recentPerLineage: number;
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)/;

function versionParts(version: string): number[] {
  const match = VERSION_PATTERN.exec(version);
  if (!match) throw new Error(`"${version}" is not a major.minor.patch version`);
  return match.slice(1).map(Number);
}

export function compareVersions(left: string, right: string): number {
  const [a, b] = [versionParts(left), versionParts(right)];
  return a.reduce((difference, part, index) => difference || part - b[index]!, 0);
}

export const lineageOf = (key: string): string => key.slice(0, key.lastIndexOf("/"));

const compareKeys = (left: string, right: string): number => left.localeCompare(right, "en", { numeric: true });

export const emptyRegistry = (site: string): Registry => ({ schema: REGISTRY_SCHEMA, site, artifacts: {} });

export function parseRegistry(text: string): Registry | null {
  const parsed = JSON.parse(text) as Partial<Registry>;
  if (parsed.schema !== REGISTRY_SCHEMA) return null;
  if (typeof parsed.artifacts !== "object" || parsed.artifacts === null) throw new Error("registry.json is malformed");
  return parsed as Registry;
}

export function serializeRegistry(registry: Registry): string {
  const artifacts = Object.fromEntries(
    Object.keys(registry.artifacts)
      .sort(compareKeys)
      .map((key) => {
        const { files, channels } = registry.artifacts[key]!;
        const sortedFiles = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
        const sortedChannels = Object.fromEntries(Object.entries(channels).sort(([a], [b]) => a.localeCompare(b)));
        return [key, { files: sortedFiles, channels: sortedChannels }];
      }),
  );
  return `${JSON.stringify({ schema: registry.schema, site: registry.site, artifacts }, null, 2)}\n`;
}

function assertImmutable(key: string, known: Record<string, RegistryFile>, seen: Record<string, RegistryFile>): void {
  for (const [name, file] of Object.entries(seen)) {
    const previous = known[name];
    if (previous && (previous.sha256 !== file.sha256 || previous.bytes !== file.bytes)) {
      throw new Error(`${key}/${name} differs from the previously published bytes; publish it under a new version`);
    }
  }
}

export function applySightings(registry: Registry, sightings: readonly Sighting[], retainedChannels: ReadonlySet<ChannelId>): Registry {
  const next = structuredClone(registry);
  const presentChannels = new Set(sightings.map(({ channel }) => channel));

  for (const { channel, appVersion, artifacts } of sightings) {
    const currentKeys = new Set(artifacts.map(({ key }) => key));
    for (const artifact of artifacts) {
      const known = next.artifacts[artifact.key];
      if (known) assertImmutable(artifact.key, known.files, artifact.files);
      next.artifacts[artifact.key] = { files: { ...known?.files, ...artifact.files }, channels: known?.channels ?? {} };
    }
    for (const [key, entry] of Object.entries(next.artifacts)) {
      const use = entry.channels[channel];
      if (currentKeys.has(key)) entry.channels[channel] = { since: use?.since ?? appVersion, until: null };
      else if (use?.until === null) entry.channels[channel] = { since: use.since, until: appVersion };
    }
  }

  for (const entry of Object.values(next.artifacts)) {
    for (const channel of Object.keys(entry.channels) as ChannelId[]) {
      if (!presentChannels.has(channel) && !retainedChannels.has(channel)) delete entry.channels[channel];
    }
  }
  return next;
}

const newestFirst = ([, left]: [string, ChannelUse], [, right]: [string, ChannelUse]): number => {
  if (left.until === null || right.until === null) return Number(right.until === null) - Number(left.until === null);
  return compareVersions(right.until, left.until);
};

function keptKeys(uses: Array<[string, ChannelUse]>, channel: ChannelId, policy: RetentionPolicy): Set<string> {
  if (channel === PRODUCTION_CHANNEL) {
    return new Set(uses.filter(([, use]) => use.until === null || compareVersions(use.until, policy.minimumProductionApp) >= 0).map(([key]) => key));
  }
  const byLineage = new Map<string, Array<[string, ChannelUse]>>();
  for (const use of uses) byLineage.set(lineageOf(use[0]), [...(byLineage.get(lineageOf(use[0])) ?? []), use]);
  return new Set([...byLineage.values()].flatMap((group) => group.sort(newestFirst).slice(0, policy.recentPerLineage).map(([key]) => key)));
}

export function applyRetention(registry: Registry, policy: RetentionPolicy): Registry {
  const next = structuredClone(registry);
  const channels = new Set(Object.values(next.artifacts).flatMap((entry) => Object.keys(entry.channels) as ChannelId[]));

  for (const channel of channels) {
    const uses = Object.entries(next.artifacts).flatMap(([key, entry]) => (entry.channels[channel] ? [[key, entry.channels[channel]!] as [string, ChannelUse]] : []));
    const kept = keptKeys(uses, channel, policy);
    for (const [key, entry] of Object.entries(next.artifacts)) if (!kept.has(key)) delete entry.channels[channel];
  }

  for (const [key, entry] of Object.entries(next.artifacts)) if (Object.keys(entry.channels).length === 0) delete next.artifacts[key];
  return next;
}
