import { blake3 } from "@noble/hashes/blake3.js";

export interface PagesEnv {
  CF_ACCOUNT_ID: string;
  CF_PAGES_API_TOKEN: string;
  CF_PAGES_PROJECT: string;
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
  console.log(`[Pages] API call started: ${method} ${url.split("?")[0]}`);
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } });
  const body = (await response.json()) as { success: boolean; result: T; errors: unknown };
  if (!response.ok || !body.success) {
    const errorReason = JSON.stringify(body.errors ?? body);
    console.error(`[Pages] API call failed: ${method} ${url.split("?")[0]} - Reason: ${errorReason}`);
    throw new Error(`cloudflare api ${url} failed: ${errorReason}`);
  }
  console.log(`[Pages] API call successful: ${method} ${url.split("?")[0]}`);
  return body.result;
}

export async function publishSnapshot(env: PagesEnv, assets: Asset[]): Promise<string> {
  console.log(`[Pages] Starting deployment of ${assets.length} assets`);
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
  return deployment.id;
}

export async function pruneHistory(env: PagesEnv, keep: number): Promise<void> {
  console.log(`[Pages] Initiating history pruning, keeping recent ${keep} deployments`);
  const deployments = await callApi<{ id: string }[]>(
    `${API}/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${env.CF_PAGES_PROJECT}/deployments?per_page=${keep + 25}`,
    env.CF_PAGES_API_TOKEN
  );
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
