import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isChannelId, type ChannelId } from "../src/config/channelProfile";
import { RUNTIME_FILE_NAMES, RUNTIME_ROOT, isAssetSegment, runtimeKey } from "../src/config/runtimeAssets";
import { deployEntries, fetchLiveFile, textEntry, type DeploymentEntry } from "../hosting/deployment";
import { descriptorOf, descriptorPathOf, partEntries } from "../hosting/layout";
import { describeLocalFile, SourceFiles, sha256OfFile, Workspace } from "../hosting/localFile";
import { readCredentials, writeSummary } from "../hosting/jobSummary";
import type { PagesProject } from "../hosting/pagesDirectUpload";
import { readSiteFiles } from "../hosting/siteFiles";
import { NpmRuntimeSource } from "./npmSource";
import { installedOrtVersion, ortDistDir } from "./ortPackage";
import { applyRetention, applySightings, emptyRegistry, parseRegistry, serializeRegistry, type Registry, type RegistryFile, type Sighting } from "./registry";
import { formatSummary } from "./summary";

const SITE_HEADERS = resolve(dirname(fileURLToPath(import.meta.url)), "site", "_headers");
const DEPLOYMENTS_TO_KEEP = 3;
const RECENT_RUNTIMES_PER_LINEAGE = 5;
const REGISTRY_PATH = "registry.json";
const NOT_ENFORCED_VERSION = "0.0.0";

interface AppSource {
  channel: ChannelId;
  dir: string;
}

interface Options {
  apps: AppSource[];
  retainedChannels: Set<ChannelId>;
  workerVersionFile: string;
  registryFile: string | null;
  dryRun: boolean;
  force: boolean;
}

function parseOptions(argv: string[]): Options {
  const options: Options = { apps: [], retainedChannels: new Set(), workerVersionFile: "", registryFile: null, dryRun: false, force: process.env.RUNTIME_FORCE === "true" };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    if (flag === "--dry-run") options.dryRun = true;
    else if (flag === "--app") {
      const [channel, dir] = (argv[(index += 1)] ?? "").split("=");
      if (!channel || !dir || !isChannelId(channel)) throw new Error("--app expects <channel>=<app directory>");
      options.apps.push({ channel, dir: resolve(dir) });
    } else if (flag === "--retain") {
      const channel = argv[(index += 1)] ?? "";
      if (!isChannelId(channel)) throw new Error(`--retain received unknown channel "${channel}"`);
      options.retainedChannels.add(channel);
    } else if (flag === "--worker-version") options.workerVersionFile = resolve(argv[(index += 1)] ?? "");
    else if (flag === "--registry") options.registryFile = resolve(argv[(index += 1)] ?? "");
    else throw new Error(`unknown option ${flag}`);
  }
  if (options.apps.length === 0 || !options.workerVersionFile) throw new Error("at least one --app and a --worker-version are required");
  return options;
}

const readMinimumClientVersion = (file: string): string => /MIN_CLIENT_VERSION\s*=\s*"(\d+\.\d+\.\d+)[^"]*"/.exec(readFileSync(file, "utf8"))?.[1] ?? NOT_ENFORCED_VERSION;

const readAppVersion = (dir: string): string => (JSON.parse(readFileSync(resolve(dir, "version.json"), "utf8")) as { version: string }).version;

async function loadBaseline(project: PagesProject | null, registryFile: string | null): Promise<Registry | null> {
  const text = registryFile ? readFileSync(registryFile, "utf8") : project ? await fetchLiveFile(project, REGISTRY_PATH) : null;
  if (text === null) {
    if (project) console.warn("::warning::The live deployment has no registry.json; starting a fresh registry");
    return null;
  }
  const parsed = parseRegistry(text);
  if (!parsed) console.warn("::warning::The live registry.json uses an older schema; rebuilding it from the current channels");
  return parsed;
}

function collectSightings(apps: AppSource[], baseline: Registry, sources: SourceFiles): Sighting[] {
  return apps.map(({ channel, dir }) => {
    const appVersion = readAppVersion(dir);
    const version = installedOrtVersion(dir);
    if (!version) return { channel, appVersion, artifacts: [] };
    if (!isAssetSegment(version)) throw new Error(`onnxruntime-web version "${version}" is not path-safe`);
    const key = runtimeKey(version);
    const files: Record<string, RegistryFile> = {};
    for (const name of RUNTIME_FILE_NAMES) {
      const path = resolve(ortDistDir(dir), name);
      sources.register(`${key}/${name}`, async () => path);
      const known = baseline.artifacts[key]?.files[name];
      files[name] = known && known.sha256 === sha256OfFile(path) ? known : describeLocalFile(path, name);
    }
    return { channel, appVersion, artifacts: [{ key, files }] };
  });
}

function registerHistoricalSources(registry: Registry, sources: SourceFiles, npm: NpmRuntimeSource): void {
  for (const [key, artifact] of Object.entries(registry.artifacts)) {
    const version = key.slice(RUNTIME_ROOT.length + 1);
    for (const name of Object.keys(artifact.files)) {
      if (!sources.has(`${key}/${name}`)) sources.register(`${key}/${name}`, async () => resolve(npm.distDirectory(version), name));
    }
  }
}

function planEntries(registry: Registry, registryText: string, notFound: string, sources: SourceFiles): DeploymentEntry[] {
  const artifactEntries = Object.entries(registry.artifacts).flatMap(([key, artifact]) =>
    Object.entries(artifact.files).flatMap(([name, file]) => [
      ...partEntries(key, name, file, (offset, length) => sources.range(`${key}/${name}`, file.sha256, offset, length)),
      textEntry(descriptorPathOf(key, name), JSON.stringify(descriptorOf(name, file))),
    ]),
  );
  return [...artifactEntries, textEntry(REGISTRY_PATH, registryText), textEntry("404.html", notFound)];
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const site = readSiteFiles(SITE_HEADERS);
  const project = options.dryRun ? null : readCredentials("CF_ASSETS_PROJECT");
  const workspace = new Workspace();
  try {
    const liveRegistry = await loadBaseline(project, options.registryFile);
    const baseline = liveRegistry ?? emptyRegistry(site.digest);
    const sources = new SourceFiles();
    const sightings = collectSightings(options.apps, baseline, sources);

    const merged = applySightings(baseline, sightings, options.retainedChannels);
    const next = applyRetention({ ...merged, site: site.digest }, { minimumProductionApp: readMinimumClientVersion(options.workerVersionFile), recentPerLineage: RECENT_RUNTIMES_PER_LINEAGE });
    registerHistoricalSources(next, sources, new NpmRuntimeSource(workspace));
    const registryText = serializeRegistry(next);
    const entries = planEntries(next, registryText, site.notFound, sources);
    const unchanged = liveRegistry !== null && serializeRegistry(liveRegistry) === registryText;

    writeSummary(formatSummary(baseline, next, unchanged && !options.force ? "unchanged" : options.dryRun ? "dry-run" : "deploy", entries.length));
    if ((unchanged && !options.force) || !project) return;

    const verifyPaths = entries.filter(({ path }) => path.endsWith(".parts.json")).map(({ path }) => path);
    await deployEntries(project, entries, site.headers, { deploymentsToKeep: DEPLOYMENTS_TO_KEEP, verifyPaths });
  } finally {
    workspace.dispose();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
