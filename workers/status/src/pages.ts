import { blake3 } from "@noble/hashes/blake3.js";
import { LegacyStats, SystemStatusSnapshot } from "./types";

export interface PagesEnv {
  CF_ACCOUNT_ID?: string;
  CF_PAGES_API_TOKEN?: string;
  CF_PAGES_PROJECT?: string;
  STATUS_URL?: string;
  ALLOWED_ORIGIN?: string;
}

export interface Asset {
  path: string;
  content: string;
  contentType: string;
}

const API = "https://api.cloudflare.com/client/v4";

function assetHash(asset: Asset): string {
  const extension = asset.path.includes(".")
    ? asset.path.split(".").pop()!
    : "";
  const base64Content = btoa(unescape(encodeURIComponent(asset.content)));
  const digest = blake3(new TextEncoder().encode(base64Content + extension));
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function callApi<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const method = init?.method ?? "GET";
  const endpoint = url.split("?")[0];
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const body = (await response.json()) as {
    success: boolean;
    result: T;
    errors: unknown;
  };
  if (!response.ok || !body.success) {
    const errorReason = JSON.stringify(body.errors ?? body);
    throw new Error(
      `cloudflare api ${method} ${endpoint} failed (${response.status}): ${errorReason}`,
    );
  }
  return body.result;
}

export async function publishSnapshot(
  env: PagesEnv,
  assets: Asset[],
): Promise<string> {
  const accountId = env.CF_ACCOUNT_ID;
  const apiToken = env.CF_PAGES_API_TOKEN;
  const project = env.CF_PAGES_PROJECT;
  if (!accountId || !apiToken || !project) {
    return "";
  }

  const hashes = assets.map(assetHash);

  const { jwt } = await callApi<{ jwt: string }>(
    `${API}/accounts/${accountId}/pages/projects/${project}/upload-token`,
    apiToken,
  );

  await callApi(`${API}/pages/assets/upload`, jwt, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      assets.map((asset, index) => ({
        key: hashes[index],
        value: btoa(unescape(encodeURIComponent(asset.content))),
        metadata: { contentType: asset.contentType },
        base64: true,
      })),
    ),
  });

  await callApi(`${API}/pages/assets/upsert-hashes`, jwt, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hashes }),
  });

  const manifest = Object.fromEntries(
    assets.map((asset, index) => [asset.path, hashes[index]]),
  );
  const form = new FormData();
  form.set("manifest", JSON.stringify(manifest));

  const deployment = await callApi<{ id: string }>(
    `${API}/accounts/${accountId}/pages/projects/${project}/deployments`,
    apiToken,
    { method: "POST", body: form },
  );

  return deployment.id;
}

export async function fetchPublishedSnapshot(
  env: PagesEnv,
): Promise<LegacyStats | null> {
  const rawUrl =
    env.STATUS_URL?.trim() ||
    (env.CF_PAGES_PROJECT ? `https://${env.CF_PAGES_PROJECT}.pages.dev` : "");
  if (!rawUrl) return null;

  const sanitized = rawUrl.replace(/\/+$/, "");
  const target = `${sanitized}/stats.json?_t=${Date.now()}`;

  try {
    const response = await fetch(target);
    if (!response.ok) return null;
    const data = (await response.json()) as LegacyStats;
    return data;
  } catch {
    return null;
  }
}

export async function fetchPublishedStatusJson(
  env: PagesEnv,
): Promise<SystemStatusSnapshot | null> {
  const rawUrl =
    env.STATUS_URL?.trim() ||
    (env.CF_PAGES_PROJECT ? `https://${env.CF_PAGES_PROJECT}.pages.dev` : "");
  if (!rawUrl) return null;

  const sanitized = rawUrl.replace(/\/+$/, "");
  const target = `${sanitized}/status.json?_t=${Date.now()}`;

  try {
    const response = await fetch(target);
    if (!response.ok) return null;
    const data = (await response.json()) as SystemStatusSnapshot;
    return data;
  } catch {
    return null;
  }
}

export async function pruneHistory(env: PagesEnv, keep: number): Promise<void> {
  const accountId = env.CF_ACCOUNT_ID;
  const apiToken = env.CF_PAGES_API_TOKEN;
  const project = env.CF_PAGES_PROJECT;
  if (!accountId || !apiToken || !project) {
    return;
  }

  const deployments = await callApi<{ id: string; created_on: string }[]>(
    `${API}/accounts/${accountId}/pages/projects/${project}/deployments?env=production&page=1&per_page=25`,
    apiToken,
  );

  deployments.sort(
    (a, b) =>
      new Date(b.created_on).getTime() - new Date(a.created_on).getTime(),
  );
  const stale = deployments.slice(keep);

  await Promise.all(
    stale.map((deployment) =>
      callApi(
        `${API}/accounts/${accountId}/pages/projects/${project}/deployments/${deployment.id}?force=true`,
        apiToken,
        { method: "DELETE" },
      ).catch(() => {}),
    ),
  );
}
