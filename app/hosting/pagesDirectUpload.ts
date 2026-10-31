import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { RUNTIME_MIME_TYPES } from "../src/config/runtimeAssets";

const API = process.env.CLOUDFLARE_API_BASE ?? "https://api.cloudflare.com/client/v4";
const PAGES_HASH_LENGTH = 32;
const MAX_BUCKET_BASE64_BYTES = 36 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 3;
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

export class CloudflareApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const projectUrl = ({ accountId, project }: PagesProject): string => `${API}/accounts/${accountId}/pages/projects/${project}`;

const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");

export const base64Length = (bytes: number): number => Math.ceil(bytes / 3) * 4;

export const pagesHash = (bytes: Uint8Array, extension: string): string =>
  bytesToHex(blake3(new TextEncoder().encode(toBase64(bytes) + extension))).slice(0, PAGES_HASH_LENGTH);

export const extensionOf = (path: string): string => (path.includes(".") ? path.split(".").pop()! : "");

const CONTENT_TYPES: Readonly<Record<string, string>> = { ...RUNTIME_MIME_TYPES, html: "text/html", json: "application/json" };

export const contentTypeOf = (path: string): string => CONTENT_TYPES[extensionOf(path)] ?? "application/octet-stream";

const isTransient = (status: number): boolean => status === 429 || status >= 500;

async function callApi<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) } });
      const body = (await response.json().catch(() => null)) as { success?: boolean; result?: T; errors?: unknown } | null;
      if (response.ok && body?.success) return body.result as T;
      if (isTransient(response.status) && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]!);
        continue;
      }
      throw new CloudflareApiError(`cloudflare api ${method} ${url.split("?")[0]} failed (${response.status}): ${JSON.stringify(body?.errors ?? body)}`, response.status);
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

export class UploadSession {
  private jwt: string | null = null;

  constructor(private readonly project: PagesProject) {}

  async token(): Promise<string> {
    this.jwt ??= (await callApi<{ jwt: string }>(`${projectUrl(this.project)}/upload-token`, this.project.apiToken)).jwt;
    return this.jwt;
  }

  refresh(): void {
    this.jwt = null;
  }
}

async function postAsset(session: UploadSession, path: string, payload: unknown): Promise<unknown> {
  const send = async (): Promise<unknown> =>
    callApi(`${API}/pages/assets/${path}`, await session.token(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  try {
    return await send();
  } catch (error) {
    if (!(error instanceof CloudflareApiError) || error.status !== 401) throw error;
    session.refresh();
    return send();
  }
}

export const findMissingHashes = (session: UploadSession, hashes: string[]): Promise<string[]> => postAsset(session, "check-missing", { hashes }) as Promise<string[]>;

export const upsertHashes = async (session: UploadSession, hashes: string[]): Promise<void> => void (await postAsset(session, "upsert-hashes", { hashes }));

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

export async function uploadFiles(session: UploadSession, files: UploadableFile[]): Promise<void> {
  const buckets = bucketize(files);
  let next = 0;
  const work = async (): Promise<void> => {
    while (next < buckets.length) {
      const bucket = buckets[next++]!;
      const payload = await Promise.all(bucket.map(async (file) => ({ key: file.hash, value: toBase64(await file.load()), metadata: { contentType: file.contentType }, base64: true })));
      await postAsset(session, "upload", payload);
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, buckets.length) }, work));
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
