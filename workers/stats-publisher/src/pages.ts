import { blake3 } from "@noble/hashes/blake3.js";
import type { Stats } from "./turso";

export interface PagesEnv {
  CF_ACCOUNT_ID: string;
  CF_PAGES_API_TOKEN: string;
  CF_PAGES_PROJECT: string;
  STATS_URL?: string;
}

export interface Asset {
  path: string;
  content: string;
  contentType: string;
}

const API = "https://api.cloudflare.com/client/v4";

function assetHash(asset: Asset): string {
  const extension = asset.path.includes(".") ? asset.path.split(".").pop()! : "";
  const base64Content = btoa(asset.content);
  const digest = blake3(new TextEncoder().encode(base64Content + extension));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function callApi<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const endpoint = url.split("?")[0];
  console.info({ message: `[Pages] API call started: ${method} ${endpoint}`, module: "Pages", requestMethod: method, endpoint });
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } });
  const body = (await response.json()) as { success: boolean; result: T; errors: unknown };
  if (!response.ok || !body.success) {
    const errorReason = JSON.stringify(body.errors ?? body);
    console.error({
      message: `[Pages] API call failed: ${method} ${endpoint} (Status: ${response.status}): ${errorReason}`,
      module: "Pages",
      requestMethod: method,
      endpoint,
      status: response.status,
      reason: errorReason
    });
    throw new Error(`cloudflare api ${url} failed with status ${response.status}: ${errorReason}`);
  }
  console.info({
    message: `[Pages] API call successful: ${method} ${endpoint} (Status: ${response.status})`,
    module: "Pages",
    requestMethod: method,
    endpoint,
    status: response.status
  });
  return body.result;
}

export async function publishSnapshot(env: PagesEnv, assets: Asset[]): Promise<string> {
  console.info({ message: `[Pages] Starting deployment (Assets: ${assets.length})`, module: "Pages", assetCount: assets.length });
  const hashes = assets.map(assetHash);

  const { jwt } = await callApi<{ jwt: string }>(
    `${API}/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${env.CF_PAGES_PROJECT}/upload-token`,
    env.CF_PAGES_API_TOKEN
  );

  await callApi(`${API}/pages/assets/upload`, jwt, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      assets.map((asset, index) => ({
        key: hashes[index],
        value: btoa(asset.content),
        metadata: { contentType: asset.contentType },
        base64: true,
      }))
    ),
  });

  await callApi(`${API}/pages/assets/upsert-hashes`, jwt, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hashes }),
  });

  const manifest = Object.fromEntries(assets.map((asset, index) => [asset.path, hashes[index]]));
  const form = new FormData();
  form.set("manifest", JSON.stringify(manifest));
  const deployment = await callApi<{ id: string }>(
    `${API}/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${env.CF_PAGES_PROJECT}/deployments`,
    env.CF_PAGES_API_TOKEN,
    { method: "POST", body: form }
  );
  console.info({ message: `[Pages] Deployment created successfully (ID: ${deployment.id})`, module: "Pages", deployment_id: deployment.id });
  return deployment.id;
}

export async function fetchPublishedSnapshot(env: PagesEnv): Promise<Stats | null> {
  const url = env.STATS_URL || `https://${env.CF_PAGES_PROJECT}.pages.dev/stats.json`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      console.info({
        message: `[Pages] No published snapshot yet (Status: ${response.status})`,
        module: "Pages",
        event: "fetch_published_empty",
        status: response.status,
      });
      return null;
    }
    const data = (await response.json()) as Stats;
    console.info({
      message: `[Pages] Fetched currently published snapshot (Total: ${data.total}, Last24h: ${data.last24h})`,
      module: "Pages",
      event: "fetch_published_ok",
      total: data.total,
      last24h: data.last24h,
    });
    return data;
  } catch (error) {
    console.error({
      message: `[Pages] Failed to fetch published snapshot: ${error instanceof Error ? error.message : String(error)}`,
      module: "Pages",
      event: "fetch_published_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function pruneHistory(env: PagesEnv, keep: number): Promise<void> {
  console.info({ message: `[Pages] Initiating history pruning (Keep: ${keep})`, module: "Pages", keepRecent: keep });
  const deployments = await callApi<{ id: string; created_on: string }[]>(
    `${API}/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${env.CF_PAGES_PROJECT}/deployments?env=production&page=1&per_page=25`,
    env.CF_PAGES_API_TOKEN
  );
  deployments.sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime());
  const stale = deployments.slice(keep);
  await Promise.all(
    stale.map((deployment) =>
      callApi(
        `${API}/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${env.CF_PAGES_PROJECT}/deployments/${deployment.id}?force=true`,
        env.CF_PAGES_API_TOKEN,
        { method: "DELETE" }
      )
    )
  );
}
