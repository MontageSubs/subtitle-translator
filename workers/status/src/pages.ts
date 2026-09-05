import { blake3 } from "@noble/hashes/blake3.js";
import { LegacyStats, SystemStatusSnapshot } from "./types";
import { logPagesDeployment, logDiagnostic, logSystemError } from "./logger";

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

  logPagesDeployment("Initiating deployment cycle", {
    project: project || "(missing)",
    accountId: accountId ? `${accountId.slice(0, 6)}...` : "(missing)",
    hasToken: Boolean(apiToken),
    assetCount: assets.length,
    assetPaths: assets.map((a) => a.path),
  });

  if (!accountId || !apiToken || !project) {
    const missing = [
      !accountId ? "CF_ACCOUNT_ID" : null,
      !apiToken ? "CF_PAGES_API_TOKEN" : null,
      !project ? "CF_PAGES_PROJECT" : null,
    ].filter(Boolean);
    logPagesDeployment("Deployment skipped due to missing credentials", { missing });
    return "";
  }

  const hashes = assets.map(assetHash);
  logPagesDeployment("Calculated asset hashes", {
    entries: assets.map((a, i) => ({ path: a.path, hash: hashes[i], length: a.content.length })),
  });

  const { jwt } = await callApi<{ jwt: string }>(
    `${API}/accounts/${accountId}/pages/projects/${project}/upload-token`,
    apiToken,
  );
  logPagesDeployment("Acquired JWT upload token", { tokenPrefix: jwt.slice(0, 10) + "..." });

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
  logPagesDeployment("Uploaded asset payloads");

  await callApi(`${API}/pages/assets/upsert-hashes`, jwt, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hashes }),
  });
  logPagesDeployment("Upserted asset hashes");

  const manifest = Object.fromEntries(
    assets.map((asset, index) => [
      asset.path.startsWith("/") ? asset.path : `/${asset.path}`,
      hashes[index],
    ]),
  );
  const form = new FormData();
  form.set("manifest", JSON.stringify(manifest));

  const deployment = await callApi<{ id: string; url?: string; environment?: string }>(
    `${API}/accounts/${accountId}/pages/projects/${project}/deployments`,
    apiToken,
    { method: "POST", body: form },
  );

  logPagesDeployment("Deployment completed successfully", {
    deploymentId: deployment.id,
    url: deployment.url || "(standard)",
    environment: deployment.environment || "production",
  });

  return deployment.id;
}

export async function fetchPublishedSnapshot(
  env: PagesEnv,
): Promise<LegacyStats | null> {
  const rawUrl =
    env.STATUS_URL?.trim() ||
    (env.CF_PAGES_PROJECT ? `https://${env.CF_PAGES_PROJECT}.pages.dev` : "");
  if (!rawUrl) {
    logDiagnostic("FetchPublishedSnapshot", "No STATUS_URL or CF_PAGES_PROJECT configured");
    return null;
  }

  const sanitized = rawUrl.replace(/\/+$/, "");
  const target = `${sanitized}/stats.json?_t=${Date.now()}`;

  try {
    const response = await fetch(target);
    logDiagnostic("FetchPublishedSnapshot", `Target: ${target} | Status: ${response.status}`);
    if (!response.ok) return null;
    const data = (await response.json()) as LegacyStats;
    return data;
  } catch (err) {
    logDiagnostic(
      "FetchPublishedSnapshot",
      `Error fetching ${target}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export async function fetchPublishedStatusJson(
  env: PagesEnv,
): Promise<SystemStatusSnapshot | null> {
  const rawUrl =
    env.STATUS_URL?.trim() ||
    (env.CF_PAGES_PROJECT ? `https://${env.CF_PAGES_PROJECT}.pages.dev` : "");
  if (!rawUrl) {
    logDiagnostic("FetchPublishedStatusJson", "No STATUS_URL or CF_PAGES_PROJECT configured");
    return null;
  }

  const sanitized = rawUrl.replace(/\/+$/, "");
  const target = `${sanitized}/status.json?_t=${Date.now()}`;

  try {
    const response = await fetch(target);
    logDiagnostic("FetchPublishedStatusJson", `Target: ${target} | Status: ${response.status}`);
    if (!response.ok) return null;
    const data = (await response.json()) as SystemStatusSnapshot;
    return data;
  } catch (err) {
    logDiagnostic(
      "FetchPublishedStatusJson",
      `Error fetching ${target}: ${err instanceof Error ? err.message : String(err)}`,
    );
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

  try {
    const deployments = await callApi<{ id: string; created_on: string }[]>(
      `${API}/accounts/${accountId}/pages/projects/${project}/deployments?env=production&page=1&per_page=25`,
      apiToken,
    );

    deployments.sort(
      (a, b) =>
        new Date(b.created_on).getTime() - new Date(a.created_on).getTime(),
    );
    const stale = deployments.slice(keep);
    logPagesDeployment("Pruning deployment history", {
      totalFound: deployments.length,
      staleCount: stale.length,
      keep,
    });

    await Promise.all(
      stale.map((deployment) =>
        callApi(
          `${API}/accounts/${accountId}/pages/projects/${project}/deployments/${deployment.id}?force=true`,
          apiToken,
          { method: "DELETE" },
        ).catch((err) => {
          logDiagnostic(
            "PruneDeployment",
            `Failed to delete stale deployment ${deployment.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }),
      ),
    );
  } catch (err) {
    logSystemError("PruneHistory", err);
  }
}
