import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const API = "https://api.cloudflare.com/client/v4";
const PAGES_HASH_LENGTH = 32;
const MAX_BUCKET_BASE64_BYTES = 32 * 1024 * 1024;
const RETRY_DELAYS_MS = [1_000, 3_000, 8_000];

export interface PagesProject {
  accountId: string;
  apiToken: string;
  project: string;
}

export interface UploadableFile {
  hash: string;
  contentType: string;
  load: () => Promise<Uint8Array>;
  base64Bytes: number;
}

export interface DeploymentResult {
  id: string;
  url: string;
  environment: string;
}

const projectUrl = ({ accountId, project }: PagesProject): string => `${API}/accounts/${accountId}/pages/projects/${project}`;

const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

export const base64Length = (bytes: number): number => Math.ceil(bytes / 3) * 4;

export const pagesHash = (bytes: Uint8Array, extension: string): string =>
  bytesToHex(blake3(new TextEncoder().encode(toBase64(bytes) + extension))).slice(0, PAGES_HASH_LENGTH);

export const extensionOf = (path: string): string => (path.includes(".") ? path.split(".").pop()! : "");

export const contentTypeOf = (path: string): string => {
  const extension = extensionOf(path);
  if (extension === "wasm") return "application/wasm";
  if (extension === "mjs") return "text/javascript";
  if (extension === "json") return "application/json";
  if (extension === "html") return "text/html";
  return "application/octet-stream";
};

async function callApi<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) } });
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]!);
        continue;
      }
      const body = (await response.json()) as { success: boolean; result: T; errors?: unknown };
      if (!response.ok || !body.success) throw new Error(`cloudflare api ${method} ${url.split("?")[0]} failed (${response.status}): ${JSON.stringify(body.errors ?? body)}`);
      return body.result;
    } catch (error) {
      if (error instanceof TypeError && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]!);
        continue;
      }
      throw error;
    }
  }
}

export async function latestProductionDeploymentUrl(project: PagesProject): Promise<string | null> {
  const deployments = await callApi<Array<{ url?: string }>>(`${projectUrl(project)}/deployments?env=production&page=1&per_page=1`, project.apiToken);
  return deployments[0]?.url?.replace(/\/+$/, "") ?? null;
}

export async function requestUploadToken(project: PagesProject): Promise<string> {
  const { jwt } = await callApi<{ jwt: string }>(`${projectUrl(project)}/upload-token`, project.apiToken);
  return jwt;
}

const postJson = (jwt: string, path: string, payload: unknown): Promise<unknown> =>
  callApi(`${API}/pages/assets/${path}`, jwt, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

export const findMissingHashes = (jwt: string, hashes: string[]): Promise<string[]> => postJson(jwt, "check-missing", { hashes }) as Promise<string[]>;

export const upsertHashes = async (jwt: string, hashes: string[]): Promise<void> => void (await postJson(jwt, "upsert-hashes", { hashes }));

function bucketize(files: UploadableFile[]): UploadableFile[][] {
  const buckets: UploadableFile[][] = [];
  let current: UploadableFile[] = [];
  let size = 0;
  for (const file of [...files].sort((a, b) => b.base64Bytes - a.base64Bytes)) {
    if (current.length > 0 && size + file.base64Bytes > MAX_BUCKET_BASE64_BYTES) {
      buckets.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += file.base64Bytes;
  }
  if (current.length > 0) buckets.push(current);
  return buckets;
}

export async function uploadFiles(jwt: string, files: UploadableFile[]): Promise<void> {
  for (const bucket of bucketize(files)) {
    const payload = await Promise.all(bucket.map(async (file) => ({ key: file.hash, value: toBase64(await file.load()), metadata: { contentType: file.contentType }, base64: true })));
    await postJson(jwt, "upload", payload);
  }
}

export async function createDeployment(project: PagesProject, manifest: Record<string, string>, headers: string): Promise<DeploymentResult> {
  const form = new FormData();
  form.set("manifest", JSON.stringify(manifest));
  form.set("_headers", new File([headers], "_headers"));
  const deployment = await callApi<{ id: string; url?: string; environment?: string }>(`${projectUrl(project)}/deployments`, project.apiToken, { method: "POST", body: form });
  return { id: deployment.id, url: (deployment.url ?? "").replace(/\/+$/, ""), environment: deployment.environment ?? "unknown" };
}

export async function pruneDeployments(project: PagesProject, keep: number): Promise<number> {
  const deployments = await callApi<Array<{ id: string; created_on: string }>>(`${projectUrl(project)}/deployments?env=production&page=1&per_page=25`, project.apiToken);
  const stale = deployments.sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on)).slice(keep);
  const outcomes = await Promise.allSettled(stale.map(({ id }) => callApi(`${projectUrl(project)}/deployments/${id}?force=true`, project.apiToken, { method: "DELETE" })));
  return outcomes.filter(({ status }) => status === "fulfilled").length;
}
