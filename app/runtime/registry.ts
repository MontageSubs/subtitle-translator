import { PRODUCTION_CHANNEL, type ChannelId } from "../src/config/channelProfile";

export const REGISTRY_SCHEMA = 1;

export interface RegistryFile {
  bytes: number;
  sha256: string;
  pages: string[];
}

export interface ChannelUse {
  since: string;
  until: string | null;
}

export interface RegistryRuntime {
  files: Record<string, RegistryFile>;
  channels: Partial<Record<ChannelId, ChannelUse>>;
}

export interface Registry {
  schema: typeof REGISTRY_SCHEMA;
  site: string;
  runtimes: Record<string, RegistryRuntime>;
}

export interface Sighting {
  channel: ChannelId;
  appVersion: string;
  runtime: { version: string; files: Record<string, RegistryFile> } | null;
}

export interface RetentionPolicy {
  minimumProductionApp: string;
  recentRuntimesPerChannel: number;
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

const compareRuntimeVersions = (left: string, right: string): number => left.localeCompare(right, "en", { numeric: true });

export const emptyRegistry = (site: string): Registry => ({ schema: REGISTRY_SCHEMA, site, runtimes: {} });

export function parseRegistry(text: string): Registry {
  const parsed = JSON.parse(text) as Registry;
  if (parsed.schema !== REGISTRY_SCHEMA || typeof parsed.runtimes !== "object" || parsed.runtimes === null) throw new Error("registry.json has an unsupported schema");
  return parsed;
}

export function serializeRegistry(registry: Registry): string {
  const runtimes = Object.fromEntries(
    Object.keys(registry.runtimes)
      .sort(compareRuntimeVersions)
      .map((version) => {
        const { files, channels } = registry.runtimes[version]!;
        const sortedChannels = Object.fromEntries(Object.entries(channels).sort(([a], [b]) => a.localeCompare(b)));
        const sortedFiles = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
        return [version, { files: sortedFiles, channels: sortedChannels }];
      }),
  );
  return `${JSON.stringify({ schema: registry.schema, site: registry.site, runtimes }, null, 2)}\n`;
}

function assertImmutable(version: string, known: Record<string, RegistryFile>, seen: Record<string, RegistryFile>): void {
  for (const [name, file] of Object.entries(seen)) {
    const previous = known[name];
    if (previous && (previous.sha256 !== file.sha256 || previous.bytes !== file.bytes)) {
      throw new Error(`${name} of onnxruntime-web ${version} differs from the previously published bytes`);
    }
  }
}

export function applySightings(registry: Registry, sightings: readonly Sighting[], retainedChannels: ReadonlySet<ChannelId>): Registry {
  const next = structuredClone(registry);
  const presentChannels = new Set(sightings.map(({ channel }) => channel));

  for (const { channel, appVersion, runtime } of sightings) {
    if (runtime) {
      const known = next.runtimes[runtime.version];
      if (known) assertImmutable(runtime.version, known.files, runtime.files);
      next.runtimes[runtime.version] = { files: runtime.files, channels: known?.channels ?? {} };
    }
    for (const [version, entry] of Object.entries(next.runtimes)) {
      const use = entry.channels[channel];
      if (version === runtime?.version) entry.channels[channel] = { since: use?.since ?? appVersion, until: null };
      else if (use?.until === null) entry.channels[channel] = { since: use.since, until: appVersion };
    }
  }

  for (const entry of Object.values(next.runtimes)) {
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

export function applyRetention(registry: Registry, policy: RetentionPolicy): Registry {
  const next = structuredClone(registry);
  const channels = new Set(Object.values(next.runtimes).flatMap((entry) => Object.keys(entry.channels) as ChannelId[]));

  for (const channel of channels) {
    const uses = Object.entries(next.runtimes).flatMap(([version, entry]) => (entry.channels[channel] ? [[version, entry.channels[channel]!] as [string, ChannelUse]] : []));
    const kept =
      channel === PRODUCTION_CHANNEL
        ? uses.filter(([, use]) => use.until === null || compareVersions(use.until, policy.minimumProductionApp) >= 0)
        : uses.sort(newestFirst).slice(0, policy.recentRuntimesPerChannel);
    const keptVersions = new Set(kept.map(([version]) => version));
    for (const [version, entry] of Object.entries(next.runtimes)) if (!keptVersions.has(version)) delete entry.channels[channel];
  }

  for (const [version, entry] of Object.entries(next.runtimes)) if (Object.keys(entry.channels).length === 0) delete next.runtimes[version];
  return next;
}
