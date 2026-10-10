import { blake3 } from "@noble/hashes/blake3.js";
import { SystemStatusSnapshot } from "../types";
import { logPagesDeployment, logDiagnostic, logSystemError } from "../logger";
import { egressBrowserFetch, egressFetch } from "../upstream/egress";
import { CHROME_USER_AGENT } from "../upstream/userAgents";

export interface PagesEnv {
  CF_ACCOUNT_ID?: string;
  CF_PAGES_API_TOKEN?: string;
  CF_PAGES_PROJECT?: string;
  STATUS_URL?: string;
}

export interface Asset {
  path: string;
  content: string;
  contentType: string;
}

interface PagesCredentials {
  accountId: string;
  apiToken: string;
  project: string;
}

const API = "https://api.cloudflare.com/client/v4";

const DEPLOYMENTS_TO_KEEP = 3;

const toBase64 = (content: string): string => btoa(unescape(encodeURIComponent(content)));

function readCredentials(env: PagesEnv): PagesCredentials | null {
  const { CF_ACCOUNT_ID: accountId, CF_PAGES_API_TOKEN: apiToken, CF_PAGES_PROJECT: project } = env;
  return accountId && apiToken && project ? { accountId, apiToken, project } : null;
}

const projectUrl = ({ accountId, project }: PagesCredentials): string =>
  `${API}/accounts/${accountId}/pages/projects/${project}`;

function assetHash(asset: Asset): string {
  const extension = asset.path.includes(".") ? asset.path.split(".").pop()! : "";
  const digest = blake3(new TextEncoder().encode(toBase64(asset.content) + extension));
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function callApi<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const response = await egressFetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers as Record<string, string> | undefined) },
    body: init?.body as BodyInit | null | undefined,
  });
  const body = (await response.json()) as { success: boolean; result: T; errors: unknown };
  if (!response.ok || !body.success) {
    throw new Error(
      `cloudflare api ${method} ${url.split("?")[0]} failed (${response.status}): ${JSON.stringify(body.errors ?? body)}`,
    );
  }
  return body.result;
}

async function uploadAssets(jwt: string, assets: Asset[], hashes: string[]): Promise<void> {
  const jsonHeaders = { "Content-Type": "application/json" };
  await callApi(`${API}/pages/assets/upload`, jwt, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(
      assets.map((asset, index) => ({
        key: hashes[index],
        value: toBase64(asset.content),
        metadata: { contentType: asset.contentType },
        base64: true,
      })),
    ),
  });
  logPagesDeployment("Uploaded asset payloads");

  await callApi(`${API}/pages/assets/upsert-hashes`, jwt, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ hashes }),
  });
  logPagesDeployment("Upserted asset hashes");
}

function buildManifestForm(assets: Asset[], hashes: string[]): FormData {
  const manifest = Object.fromEntries(
    assets.map((asset, index) => [asset.path.startsWith("/") ? asset.path : `/${asset.path}`, hashes[index]]),
  );
  const form = new FormData();
  form.set("manifest", JSON.stringify(manifest));
  return form;
}

async function publishSnapshot(env: PagesEnv, assets: Asset[]): Promise<string> {
  const credentials = readCredentials(env);

  logPagesDeployment("Initiating deployment cycle", {
    project: env.CF_PAGES_PROJECT || "(missing)",
    accountId: env.CF_ACCOUNT_ID ? `${env.CF_ACCOUNT_ID.slice(0, 6)}...` : "(missing)",
    hasToken: Boolean(env.CF_PAGES_API_TOKEN),
    assetCount: assets.length,
    assetPaths: assets.map((a) => a.path),
  });

  if (!credentials) {
    const missing = (["CF_ACCOUNT_ID", "CF_PAGES_API_TOKEN", "CF_PAGES_PROJECT"] as const).filter((key) => !env[key]);
    logPagesDeployment("Deployment skipped due to missing credentials", { missing });
    return "";
  }

  const hashes = assets.map(assetHash);
  logPagesDeployment("Calculated asset hashes", {
    entries: assets.map((a, i) => ({ path: a.path, hash: hashes[i], length: a.content.length })),
  });

  const { jwt } = await callApi<{ jwt: string }>(`${projectUrl(credentials)}/upload-token`, credentials.apiToken);
  logPagesDeployment("Acquired JWT upload token", { tokenPrefix: jwt.slice(0, 10) + "..." });

  await uploadAssets(jwt, assets, hashes);

  const deployment = await callApi<{ id: string; url?: string; environment?: string }>(
    `${projectUrl(credentials)}/deployments`,
    credentials.apiToken,
    { method: "POST", body: buildManifestForm(assets, hashes) },
  );
  logPagesDeployment("Deployment completed successfully", {
    deploymentId: deployment.id,
    url: deployment.url || "(standard)",
    environment: deployment.environment || "production",
  });
  return deployment.id;
}

async function latestDeploymentUrl(env: PagesEnv): Promise<string | null> {
  const credentials = readCredentials(env);
  if (!credentials) return null;
  const deployments = await callApi<Array<{ url?: string }>>(
    `${projectUrl(credentials)}/deployments?env=production&page=1&per_page=1`,
    credentials.apiToken,
  );
  return deployments[0]?.url ?? null;
}

function publishedJsonSources(env: PagesEnv, file: string): string[] {
  const bases: string[] = [];
  if (env.CF_PAGES_PROJECT?.trim()) bases.push(`https://${env.CF_PAGES_PROJECT.trim()}.pages.dev`);
  if (env.STATUS_URL?.trim()) bases.push(env.STATUS_URL.trim().replace(/\/+$/, ""));
  return bases.map((base) => `${base}/${file}?_t=${Date.now()}`);
}

const PUBLISHED_JSON_HEADERS = { Accept: "application/json, text/plain, */*", "Cache-Control": "no-cache" };

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await egressBrowserFetch(url, { userAgent: CHROME_USER_AGENT, headers: PUBLISHED_JSON_HEADERS });
    logDiagnostic("FetchPublishedJson", `Target: ${url} | Status: ${response.status}`);
    return response.ok ? ((await response.json()) as T) : null;
  } catch (err) {
    logDiagnostic("FetchPublishedJson", `Error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function fetchPublishedJson<T>(env: PagesEnv, file: string): Promise<T | null> {
  const sources = publishedJsonSources(env, file);
  if (sources.length === 0) {
    logDiagnostic("FetchPublishedJson", "No STATUS_URL or CF_PAGES_PROJECT configured");
  }
  for (const source of sources) {
    const data = await fetchJson<T>(source);
    if (data) return data;
  }
  const deploymentUrl = await latestDeploymentUrl(env).catch(() => null);
  return deploymentUrl ? fetchJson<T>(`${deploymentUrl.replace(/\/+$/, "")}/${file}?_t=${Date.now()}`) : null;
}

export const fetchPublishedStatusJson = (env: PagesEnv): Promise<SystemStatusSnapshot | null> =>
  fetchPublishedJson<SystemStatusSnapshot>(env, "status.json");

async function pruneHistory(env: PagesEnv, keep: number): Promise<void> {
  const credentials = readCredentials(env);
  if (!credentials) return;

  try {
    const deployments = await callApi<{ id: string; created_on: string }[]>(
      `${projectUrl(credentials)}/deployments?env=production&page=1&per_page=25`,
      credentials.apiToken,
    );
    deployments.sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on));
    const stale = deployments.slice(keep);
    logPagesDeployment("Pruning deployment history", {
      totalFound: deployments.length,
      staleCount: stale.length,
      keep,
    });

    await Promise.all(
      stale.map((deployment) =>
        callApi(`${projectUrl(credentials)}/deployments/${deployment.id}?force=true`, credentials.apiToken, {
          method: "DELETE",
        }).catch((err) => {
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

export async function deployAssets(env: PagesEnv, assets: Asset[]): Promise<string> {
  const deployId = await publishSnapshot(env, assets);
  if (deployId) {
    logPagesDeployment("Deployment publish finished", { deployId });
    await pruneHistory(env, DEPLOYMENTS_TO_KEEP);
  } else {
    logPagesDeployment("Deployment publish returned empty ID");
  }
  return deployId;
}
