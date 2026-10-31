import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { descriptorNameOf } from "../src/config/assetLayout";
import { baseUrlsOf, deployEntries, fetchLiveFile } from "../hosting/deployment";
import { mebibytes, readCredentials, writeSummary } from "../hosting/jobSummary";
import { describeLocalFile, downloadTo, SourceFiles, Workspace } from "../hosting/localFile";
import type { PagesProject } from "../hosting/pagesDirectUpload";
import { readSiteFiles } from "../hosting/siteFiles";
import { readMirrorTargets, type MirrorFileTarget, type MirrorTarget } from "./catalog";
import { emptyLedger, parseLedger, revisionOf, serializeLedger, type Ledger, type MirrorFile, type MirrorModel } from "./ledger";
import { buildModelSite, MODEL_POINTER_NAME, modelDirectory } from "./site";
import { fingerprintOf } from "./upstream";

const SITE_HEADERS = resolve(dirname(fileURLToPath(import.meta.url)), "site", "_headers");
const LEDGER_PATH = "registry.json";
const DEPLOYMENTS_TO_KEEP = 3;

interface Options {
  catalogs: string[];
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
    else if (flag === "--catalog") options.catalogs.push(resolve(argv[(index += 1)] ?? ""));
    else if (flag === "--ledger") options.ledgerFile = resolve(argv[(index += 1)] ?? "");
    else throw new Error(`unknown option ${flag}`);
  }
  if (options.catalogs.length === 0) throw new Error("at least one --catalog directory is required");
  return options;
}

async function loadLedger(project: PagesProject | null, file: string | null): Promise<Ledger | null> {
  const text = file ? readFileSync(file, "utf8") : project ? await fetchLiveFile(project, LEDGER_PATH) : null;
  if (text === null) {
    if (project) console.warn("::warning::The live deployment has no registry.json; starting a fresh registry");
    return null;
  }
  const parsed = parseLedger(text);
  if (!parsed) console.warn("::warning::The live registry.json uses another schema; rebuilding it from the catalogs");
  return parsed;
}

interface Resolution {
  file: MirrorFile;
  state: "kept" | "new" | "updated";
}

async function resolveFile(target: MirrorFileTarget, known: MirrorFile | undefined, sourceId: string, sources: SourceFiles, workspace: Workspace): Promise<Resolution> {
  const fingerprint = await fingerprintOf(target.source);
  const unchanged = known && known.source.url === target.source && (target.sha256 ? known.sha256 === target.sha256 : fingerprint !== null && known.source.fingerprint === fingerprint);
  if (unchanged) {
    sources.register(sourceId, async () => {
      const path = workspace.nextPath();
      await downloadTo(target.source, path);
      return path;
    });
    return { file: known, state: "kept" };
  }
  const path = workspace.nextPath();
  await downloadTo(target.source, path);
  const described = describeLocalFile(path, target.name);
  if (target.sha256 && described.sha256 !== target.sha256) throw new Error(`${target.source} does not match the pinned checksum ${target.sha256}`);
  sources.register(sourceId, async () => path);
  const source = { url: target.source, fingerprint };
  if (known && known.sha256 === described.sha256) return { file: { ...known, source }, state: "kept" };
  return { file: { ...described, source }, state: known ? "updated" : "new" };
}

async function resolveModel(target: MirrorTarget, known: MirrorModel | undefined, sources: SourceFiles, workspace: Workspace): Promise<{ model: MirrorModel; states: Map<string, Resolution["state"]> }> {
  const files: Record<string, MirrorFile> = {};
  const states = new Map<string, Resolution["state"]>();
  for (const entry of target.files) {
    const { file, state } = await resolveFile(entry, known?.files[entry.name], `${target.id}/${entry.name}`, sources, workspace);
    files[entry.name] = file;
    states.set(entry.name, state);
  }
  const revision = revisionOf(files);
  return { model: { revision, updatedAt: known?.revision === revision ? known.updatedAt : new Date().toISOString(), files }, states };
}

function formatSummary(ledger: Ledger, states: Map<string, Map<string, Resolution["state"]>>, removed: string[], outcome: string, fileCount: number): string {
  const sourcesBase = baseUrlsOf(process.env.MODELS_SOURCES);
  const rows = Object.entries(ledger.models).map(([id, model]) => {
    const files = Object.entries(model.files).map(([name, file]) => `${name} (${mebibytes(file.bytes)}, ${file.parts.length} part${file.parts.length === 1 ? "" : "s"}, ${states.get(id)?.get(name) ?? "kept"})`).join("<br>");
    return `| ${id} | ${model.revision} | ${files} |`;
  });
  const urls = sourcesBase.length === 0 ? [] : ["", "Descriptor URLs for the model manifests:", ...Object.entries(ledger.models).flatMap(([id, model]) => Object.keys(model.files).map((name) => `- ${id}/${name}: ${sourcesBase.map((base) => `${base}/${modelDirectory(id)}/${descriptorNameOf(name)}`).join(" , ")}`)), `- pointer: ${sourcesBase[0]}/${modelDirectory("<id>")}/${MODEL_POINTER_NAME}`];
  return ["### Model mirror", `Outcome: **${outcome}** · ${fileCount} files in the deployment${removed.length ? ` · delisted: ${removed.join(", ")}` : ""}`, "", "| Model | Revision | Files |", "| --- | --- | --- |", ...rows, ...urls, ""].join("\n");
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const site = readSiteFiles(SITE_HEADERS);
  const project = options.dryRun ? null : readCredentials("CF_MODELS_PROJECT");
  const workspace = new Workspace();
  try {
    const live = await loadLedger(project, options.ledgerFile);
    const baseline = live ?? emptyLedger(site.digest);
    const targets = readMirrorTargets(options.catalogs);
    if (targets.length === 0 && Object.keys(baseline.models).length > 0 && !options.allowEmpty) throw new Error("the catalogs list no mirrorable model while models are published; pass --allow-empty to delist them all");

    const sources = new SourceFiles();
    const next: Ledger = { schema: baseline.schema, site: site.digest, models: {} };
    const states = new Map<string, Map<string, Resolution["state"]>>();
    for (const target of targets) {
      const resolved = await resolveModel(target, baseline.models[target.id], sources, workspace);
      next.models[target.id] = resolved.model;
      states.set(target.id, resolved.states);
    }

    const ledgerText = serializeLedger(next);
    const { entries, verifyPaths } = buildModelSite(next, ledgerText, site.notFound, sources);
    const removed = Object.keys(baseline.models).filter((id) => !(id in next.models));
    const unchanged = live !== null && serializeLedger(live) === ledgerText;
    writeSummary(formatSummary(next, states, removed, unchanged && !options.force ? "unchanged" : options.dryRun ? "dry-run" : "deploy", entries.length));
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
