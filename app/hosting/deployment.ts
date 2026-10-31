import { ASSET_SITE_FILE_LIMIT } from "../src/config/assetLayout";
import {
  base64Length,
  contentTypeOf,
  createDeployment,
  findMissingHashes,
  latestProductionDeploymentUrl,
  pagesHash,
  pruneDeployments,
  upsertHashes,
  uploadFiles,
  UploadSession,
  type PagesProject,
  type UploadableFile,
  extensionOf,
} from "./pagesDirectUpload";

const VERIFY_ATTEMPTS = 8;
const VERIFY_DELAY_MS = 4_000;
const FILE_COUNT_MARGIN = 500;

export interface DeploymentEntry {
  path: string;
  hash: string;
  contentType: string;
  size: number;
  load: () => Promise<Uint8Array>;
}

export interface DeployOptions {
  deploymentsToKeep: number;
  verifyPaths: string[];
}

export { contentTypeOf };

export function textEntry(path: string, text: string): DeploymentEntry {
  const bytes = new TextEncoder().encode(text);
  return { path, hash: pagesHash(bytes, extensionOf(path)), contentType: contentTypeOf(path), size: bytes.byteLength, load: async () => bytes };
}

export const baseUrlsOf = (value: string | undefined): string[] => (value ?? "").split(",").map((entry) => entry.trim().replace(/\/+$/, "")).filter(Boolean);

export async function fetchLiveFile(project: PagesProject, path: string): Promise<string | null> {
  const deploymentUrl = await latestProductionDeploymentUrl(project);
  if (!deploymentUrl) return null;
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${deploymentUrl}/${path}`, { headers: { "Cache-Control": "no-cache" } }).catch(() => null);
    if (response?.status === 404) return null;
    if (response?.ok) return response.text();
    if (attempt >= 3) throw new Error(`reading ${path} from the live deployment failed (HTTP ${response?.status ?? "unreachable"})`);
    await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
  }
}

async function verifyDeployment(deploymentUrl: string, paths: string[]): Promise<void> {
  for (const path of paths) {
    for (let attempt = 1; ; attempt += 1) {
      const response = await fetch(`${deploymentUrl}/${path}`, { method: "HEAD" }).catch(() => null);
      if (response?.ok && !(response.headers.get("content-type") ?? "").includes("text/html")) break;
      if (attempt === VERIFY_ATTEMPTS) throw new Error(`${path} is not served correctly by ${deploymentUrl} (HTTP ${response?.status ?? "unreachable"})`);
      await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS));
    }
  }
}

export async function deployEntries(project: PagesProject, entries: DeploymentEntry[], headers: string, options: DeployOptions): Promise<void> {
  if (entries.length > ASSET_SITE_FILE_LIMIT - FILE_COUNT_MARGIN) throw new Error(`${entries.length} files would approach the ${ASSET_SITE_FILE_LIMIT}-file limit of a Pages project`);
  const session = new UploadSession(project);
  const hashes = [...new Set(entries.map(({ hash }) => hash))];
  const missing = new Set(await findMissingHashes(session, hashes));
  const unique = new Map(entries.filter(({ hash }) => missing.has(hash)).map((entry) => [entry.hash, entry]));
  const uploads: UploadableFile[] = [...unique.values()].map((entry) => ({
    hash: entry.hash,
    contentType: entry.contentType,
    base64Bytes: base64Length(entry.size),
    load: async () => {
      const bytes = await entry.load();
      if (pagesHash(bytes, extensionOf(entry.path)) !== entry.hash) throw new Error(`${entry.path} does not hash to the recorded value`);
      return bytes;
    },
  }));
  await uploadFiles(session, uploads);
  await upsertHashes(session, hashes);
  console.log(`Uploaded ${uploads.length} of ${hashes.length} objects; the rest were already stored`);

  const manifest = Object.fromEntries(entries.map(({ path, hash }) => [`/${path}`, hash]));
  const deployment = await createDeployment(project, manifest, headers);
  if (deployment.environment !== "production") throw new Error(`deployment ${deployment.id} landed in "${deployment.environment}" instead of production; check the project's production branch`);
  await verifyDeployment(deployment.url, options.verifyPaths);
  console.log(`Deployment ${deployment.id} verified; pruned ${await pruneDeployments(project, options.deploymentsToKeep)} older deployments`);
}
