import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTION_CHANNEL, isChannelId, type ChannelId } from "../src/config/channelProfile";
import { resolveSiteConfig } from "../src/config/site";
import { RUNTIME_FILE_NAMES, RUNTIME_PART_BYTES, isRuntimeVersion, runtimePart, runtimePartNames, runtimePath } from "../src/config/runtimeAssets";
import { installedOrtVersion, ortDistDir, sha256Of } from "./ortPackage";
import {
  assertProjectExists,
  base64Length,
  contentTypeOf,
  createDeployment,
  extensionOf,
  findMissingHashes,
  latestProductionDeploymentUrl,
  pagesHash,
  pruneDeployments,
  requestUploadToken,
  uploadFiles,
  upsertHashes,
  type PagesProject,
  type UploadableFile,
} from "./pagesDirectUpload";
import { applyRetention, applySightings, emptyRegistry, parseRegistry, serializeRegistry, type Registry, type RegistryFile, type Sighting } from "./registry";
import { RuntimeBytes } from "./runtimeBytes";
import { formatSummary } from "./summary";

const RUNTIME_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_DIR = resolve(RUNTIME_DIR, "site");
const DEPLOYMENTS_TO_KEEP = 3;
const RECENT_RUNTIMES_PER_CHANNEL = 5;
const VERIFY_ATTEMPTS = 8;
const VERIFY_DELAY_MS = 4_000;
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

function readCredentials(): PagesProject {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const project = process.env.CF_ASSETS_PROJECT;
  if (!accountId || !apiToken || !project) throw new Error("CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and CF_ASSETS_PROJECT are required");
  return { accountId, apiToken, project };
}

const readMinimumClientVersion = (file: string): string => /MIN_CLIENT_VERSION\s*=\s*"(\d+\.\d+\.\d+)[^"]*"/.exec(readFileSync(file, "utf8"))?.[1] ?? NOT_ENFORCED_VERSION;

const readAppVersion = (dir: string): string => (JSON.parse(readFileSync(resolve(dir, "version.json"), "utf8")) as { version: string }).version;

function readSite(): { headers: string; notFound: string; digest: string } {
  const headers = readFileSync(resolve(SITE_DIR, "_headers"), "utf8");
  const { siteUrl } = resolveSiteConfig({ VITE_SITE_URL: process.env.MAIN_SITE_URL }, PRODUCTION_CHANNEL);
  const notFound = readFileSync(resolve(SITE_DIR, "404.html"), "utf8").replaceAll("__SITE_URL__", siteUrl);
  return { headers, notFound, digest: sha256Of(Buffer.from(`${headers}\0${notFound}`)).slice(0, 16) };
}

function describeFile(name: string, bytes: Uint8Array): RegistryFile {
  const pages = runtimePartNames(name, bytes.byteLength).map((partName, index) => pagesHash(runtimePart(bytes, index), extensionOf(partName)));
  return { bytes: bytes.byteLength, sha256: sha256Of(bytes), pages };
}

function collectSightings(apps: AppSource[], bytesStore: RuntimeBytes): Sighting[] {
  return apps.map(({ channel, dir }) => {
    const appVersion = readAppVersion(dir);
    const version = installedOrtVersion(dir);
    if (!version) return { channel, appVersion, runtime: null };
    if (!isRuntimeVersion(version)) throw new Error(`onnxruntime-web version "${version}" is not path-safe`);
    const files = Object.fromEntries(
      RUNTIME_FILE_NAMES.map((name) => {
        const bytes = readFileSync(resolve(ortDistDir(dir), name));
        bytesStore.put(version, name, bytes);
        return [name, describeFile(name, bytes)];
      }),
    );
    return { channel, appVersion, runtime: { version, files } };
  });
}

async function fetchLiveRegistry(project: PagesProject): Promise<Registry | null> {
  const deploymentUrl = await latestProductionDeploymentUrl(project);
  if (!deploymentUrl) return null;
  const response = await fetch(`${deploymentUrl}/${REGISTRY_PATH}`, { headers: { "Cache-Control": "no-cache" } });
  if (response.status === 404) {
    console.warn("::warning::The live deployment has no registry.json; starting a fresh registry");
    return null;
  }
  if (!response.ok) throw new Error(`reading the live registry failed with HTTP ${response.status}`);
  return parseRegistry(await response.text());
}

interface DeploymentEntry {
  path: string;
  hash: string;
  contentType: string;
  load: () => Promise<Uint8Array>;
  size: number;
}

function planEntries(registry: Registry, registryText: string, notFound: string, bytesStore: RuntimeBytes): DeploymentEntry[] {
  const entries: DeploymentEntry[] = Object.entries(registry.runtimes).flatMap(([version, runtime]) =>
    Object.entries(runtime.files).flatMap(([name, file]) =>
      runtimePartNames(name, file.bytes).map((partName, index) => ({
        path: runtimePath(version, partName),
        hash: file.pages[index]!,
        contentType: contentTypeOf(partName),
        load: async () => bytesStore.obtainPart(version, name, file.sha256, index),
        size: Math.min(RUNTIME_PART_BYTES, file.bytes - index * RUNTIME_PART_BYTES),
      })),
    ),
  );
  const textEntry = (path: string, text: string): DeploymentEntry => {
    const bytes = new TextEncoder().encode(text);
    return { path, hash: pagesHash(bytes, extensionOf(path)), contentType: contentTypeOf(path), load: async () => bytes, size: bytes.byteLength };
  };
  return [...entries, textEntry(REGISTRY_PATH, registryText), textEntry("404.html", notFound)];
}

async function verifyDeployment(deploymentUrl: string, entries: DeploymentEntry[]): Promise<void> {
  const probes = entries.filter(({ path }) => path.startsWith("ort/"));
  for (const { path } of probes) {
    for (let attempt = 1; ; attempt += 1) {
      const response = await fetch(`${deploymentUrl}/${path}`, { method: "HEAD" }).catch(() => null);
      if (response?.ok && !(response.headers.get("content-type") ?? "").includes("text/html")) break;
      if (attempt === VERIFY_ATTEMPTS) throw new Error(`${path} is not served correctly by ${deploymentUrl} (HTTP ${response?.status ?? "unreachable"})`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, VERIFY_DELAY_MS));
    }
  }
}

function writeSummary(markdown: string): void {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const site = readSite();
  const bytesStore = new RuntimeBytes();
  const sightings = collectSightings(options.apps, bytesStore);
  const project = options.dryRun ? null : readCredentials();
  if (project) await assertProjectExists(project);

  const liveRegistry = options.registryFile ? parseRegistry(readFileSync(options.registryFile, "utf8")) : project ? await fetchLiveRegistry(project) : null;
  const baseline = liveRegistry ?? emptyRegistry(site.digest);

  const merged = applySightings(baseline, sightings, options.retainedChannels);
  const next = applyRetention({ ...merged, site: site.digest }, { minimumProductionApp: readMinimumClientVersion(options.workerVersionFile), recentRuntimesPerChannel: RECENT_RUNTIMES_PER_CHANNEL });
  const registryText = serializeRegistry(next);
  const unchanged = liveRegistry !== null && serializeRegistry(liveRegistry) === registryText;

  writeSummary(formatSummary(baseline, next, unchanged && !options.force ? "unchanged" : options.dryRun ? "dry-run" : "deploy"));
  if ((unchanged && !options.force) || !project) return;

  const entries = planEntries(next, registryText, site.notFound, bytesStore);
  const jwt = await requestUploadToken(project);
  const hashes = [...new Set(entries.map(({ hash }) => hash))];
  const missing = new Set(await findMissingHashes(jwt, hashes));
  const uploads: UploadableFile[] = [...new Map(entries.filter(({ hash }) => missing.has(hash)).map((entry) => [entry.hash, entry])).values()].map((entry) => ({
    hash: entry.hash,
    contentType: entry.contentType,
    base64Bytes: base64Length(entry.size),
    load: async () => {
      const bytes = await entry.load();
      if (pagesHash(bytes, extensionOf(entry.path)) !== entry.hash) throw new Error(`${entry.path} does not hash to the recorded value`);
      return bytes;
    },
  }));
  await uploadFiles(jwt, uploads);
  await upsertHashes(jwt, hashes);
  console.log(`Uploaded ${uploads.length} of ${hashes.length} objects; the rest were already stored`);

  const manifest = Object.fromEntries(entries.map(({ path, hash }) => [`/${path}`, hash]));
  const deployment = await createDeployment(project, manifest, site.headers);
  if (deployment.environment !== "production") throw new Error(`deployment ${deployment.id} landed in "${deployment.environment}" instead of production; check the project's production branch`);
  await verifyDeployment(deployment.url, entries);
  console.log(`Deployment ${deployment.id} verified; pruned ${await pruneDeployments(project, DEPLOYMENTS_TO_KEEP)} older deployments`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
