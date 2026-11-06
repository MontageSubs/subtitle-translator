import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deployEntries, fetchLiveFile } from "../hosting/deployment";
import { readCredentials } from "../hosting/credentials";
import { describeLocalFile, downloadTo, SourceFiles, Workspace } from "../hosting/localFile";
import { resolvePagesProject, type PagesProject } from "../hosting/pagesDirectUpload";
import { readSiteFiles } from "../hosting/siteFiles";
import { readChannelManifests, readMirrorTargets, type CatalogSource, type MirrorFileTarget, type MirrorTarget } from "./catalog";
import { emptyLedger, parseLedger, revisionOf, serializeLedger, type Ledger, type MirrorFile, type MirrorModel } from "./ledger";
import { buildModelSite, channelCatalogDocument } from "./site";
import { createHash } from "node:crypto";
import { fetchUpstreamMeta, fingerprintOf } from "./upstream";

const SITE_HEADERS = resolve(dirname(fileURLToPath(import.meta.url)), "site", "_headers");
const LEDGER_PATH = "registry.json";
const DEPLOYMENTS_TO_KEEP = 3;

interface Options {
  catalogs: CatalogSource[];
  ledgerFile: string | null;
  dryRun: boolean;
  force: boolean;
  allowEmpty: boolean;
}

function parseOptions(argv: string[]): Options {
  const options: Options = { catalogs: [], ledgerFile: null, dryRun: false, force: process.env.MIRROR_FORCE === "true", allowEmpty: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    if (flag === "--dry-run") options.dryRun = true;
    else if (flag === "--allow-empty") options.allowEmpty = true;
    else if (flag === "--catalog") {
      const value = argv[(index += 1)] ?? "";
      const separator = value.indexOf("=");
      options.catalogs.push(separator > 0 ? { channel: value.slice(0, separator), directory: resolve(value.slice(separator + 1)) } : { channel: "production", directory: resolve(value) });
    }
    else if (flag === "--ledger") options.ledgerFile = resolve(argv[(index += 1)] ?? "");
    else throw new Error(`unknown option ${flag}`);
  }
  if (options.catalogs.length === 0) throw new Error("at least one --catalog directory is required");
  return options;
}

async function loadLedger(project: PagesProject | null, file: string | null): Promise<Ledger | null> {
  const text = file ? readFileSync(file, "utf8") : project ? await fetchLiveFile(project, LEDGER_PATH) : null;
  return text === null ? null : parseLedger(text);
}

async function resolveFile(target: MirrorFileTarget, known: MirrorFile | undefined, sourceId: string, sources: SourceFiles, workspace: Workspace): Promise<MirrorFile> {
  const fingerprint = await fingerprintOf(target.source);
  const unchanged = known && known.source.url === target.source && (target.sha256 ? known.sha256 === target.sha256 : fingerprint !== null && known.source.fingerprint === fingerprint);
  if (unchanged) {
    sources.register(sourceId, async () => {
      const path = workspace.nextPath();
      await downloadTo(target.source, path);
      return path;
    });
    return known;
  }
  const path = workspace.nextPath();
  await downloadTo(target.source, path);
  const described = describeLocalFile(path, target.name);
  if (target.sha256 && described.sha256 !== target.sha256) throw new Error(`${target.source} does not match the pinned checksum ${target.sha256}`);
  sources.register(sourceId, async () => path);
  const source = { url: target.source, fingerprint };
  if (known && known.sha256 === described.sha256) return { ...known, source };
  return { ...described, source };
}

async function resolveModel(target: MirrorTarget, known: MirrorModel | undefined, sources: SourceFiles, workspace: Workspace): Promise<MirrorModel> {
  const files: Record<string, MirrorFile> = {};
  for (const entry of target.files) {
    files[entry.name] = await resolveFile(entry, known?.files[entry.name], `${target.id}/${entry.name}`, sources, workspace);
  }
  const revision = revisionOf(files);
  const meta = (target.repository ? await fetchUpstreamMeta(target.repository) : null) ?? known?.meta;
  return { revision, updatedAt: known?.revision === revision ? known.updatedAt : new Date().toISOString(), ...(meta ? { meta } : {}), files };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const site = readSiteFiles(SITE_HEADERS);
  const project = options.dryRun ? null : await resolvePagesProject(readCredentials("PAGES_MODELS"));
  const workspace = new Workspace();
  try {
    const live = await loadLedger(project, options.ledgerFile);
    const baseline = live ?? emptyLedger(site.digest);
    const targets = readMirrorTargets(options.catalogs);
    if (targets.length === 0 && Object.keys(baseline.models).length > 0 && !options.allowEmpty) throw new Error("the catalogs list no mirrorable model while models are published; pass --allow-empty to delist them all");

    const sources = new SourceFiles();
    const next: Ledger = { schema: baseline.schema, site: site.digest, catalogs: {}, models: {} };
    for (const target of targets) {
      next.models[target.id] = await resolveModel(target, baseline.models[target.id], sources, workspace);
    }

    const catalogDocuments = new Map<string, string>();
    for (const [channel, manifests] of readChannelManifests(options.catalogs)) {
      const document = channelCatalogDocument(next, manifests);
      catalogDocuments.set(channel, document);
      next.catalogs[channel] = createHash("sha256").update(document).digest("hex").slice(0, 12);
    }
    const ledgerText = serializeLedger(next);
    const { entries, verifyPaths } = buildModelSite(next, ledgerText, site.notFound, sources, catalogDocuments);
    const unchanged = live !== null && serializeLedger(live) === ledgerText;
    if ((unchanged && !options.force) || !project) return;

    await deployEntries(project, entries, site.headers, { deploymentsToKeep: DEPLOYMENTS_TO_KEEP, verifyPaths });
  } finally {
    workspace.dispose();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
