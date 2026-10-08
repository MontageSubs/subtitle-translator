import type { Env } from "../../../../config/env";
import { registerRuntimeSecret } from "../../../../http/outputGuard";
import { errorMessage, logEngine } from "../../../../telemetry/log";
import { egressBrowserFetch } from "../../../../upstream/egress";

export const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

const SAFE_USER_AGENT_PATTERN = /^Mozilla\/5\.0 \([a-zA-Z0-9_.;\-\s]+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/[0-9.]+ Safari\/537\.36$/;
const FORBIDDEN_UA_MARKERS = ["Edg/", "OPR/", "Brave", "Vivaldi"];
const ELEMENT_SCRIPT_URL = "https://translate.google.com/translate_a/element.js";
const BUNDLE_URL_PATTERN = /['"]((?:https?:)?\\?\/\\?\/translate\.googleapis\.com\\?\/_\\?\/translate_http\\?\/_\\?\/js\\?\/[^'"]+)['"]/i;
const TOKEN_PATTERN = /['"]x-goog-api-key['"]\s*:\s*['"]([a-zA-Z0-9_\-]{39})['"]/i;
const TOKEN_KEY = "pa_session_token";

let hotToken: string | null = null;
let activeRefresh: Promise<string> | null = null;

export function resolveUserAgent(clientUserAgent: string | undefined): string {
  const strict =
    clientUserAgent !== undefined && clientUserAgent.length <= 256 && SAFE_USER_AGENT_PATTERN.test(clientUserAgent) &&
    !FORBIDDEN_UA_MARKERS.some((marker) => clientUserAgent.includes(marker));
  return strict ? clientUserAgent : CHROME_UA;
}

function remember(token: string): void {
  hotToken = token;
  registerRuntimeSecret(token);
}

async function persist(env: Env, token: string): Promise<void> {
  await env.DB
    .prepare("INSERT INTO system_config (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(TOKEN_KEY, token, Date.now())
    .run();
}

async function loadPersisted(env: Env): Promise<string | null> {
  try {
    return (await env.DB.prepare("SELECT value FROM system_config WHERE key = ?1").bind(TOKEN_KEY).first<{ value: string }>())?.value || null;
  } catch {
    return null;
  }
}

async function scrapeToken(userAgent: string): Promise<string> {
  const scriptRequest = { userAgent, secFetchSite: "cross-site", secFetchMode: "no-cors", secFetchDest: "script" };
  const loader = await (await egressBrowserFetch(ELEMENT_SCRIPT_URL, scriptRequest)).text();
  const bundleMatch = loader.match(BUNDLE_URL_PATTERN);
  if (!bundleMatch?.[1]) {
    logEngine("google-pa", "session token refresh failed: script_not_found");
    throw new Error("Initialization failed");
  }
  let bundleUrl = bundleMatch[1].replace(/\\\//g, "/").replace(/\\x3d/gi, "=").replace(/\\u003d/gi, "=");
  if (bundleUrl.startsWith("//")) bundleUrl = `https:${bundleUrl}`;
  const bundle = await (await egressBrowserFetch(bundleUrl, scriptRequest)).text();
  const tokenMatch = bundle.match(TOKEN_PATTERN);
  if (!tokenMatch?.[1]) {
    logEngine("google-pa", "session token refresh failed: token_not_found");
    throw new Error("Initialization parse failed");
  }
  return tokenMatch[1];
}

export function refreshSessionToken(env: Env, clientUserAgent?: string): Promise<string> {
  activeRefresh ??= (async () => {
    try {
      logEngine("google-pa", "session token refresh started");
      const token = await scrapeToken(resolveUserAgent(clientUserAgent));
      remember(token);
      await persist(env, token).catch((error) => logEngine("google-pa", `session token persist failed: ${errorMessage(error)}`));
      return token;
    } finally {
      activeRefresh = null;
    }
  })();
  return activeRefresh;
}

export async function getSessionToken(env: Env, clientUserAgent?: string): Promise<string> {
  if (hotToken) return hotToken;
  const persisted = await loadPersisted(env);
  if (persisted) {
    remember(persisted);
    return persisted;
  }
  if (env.GOOGLE_TRANSLATE_API_KEY) {
    remember(env.GOOGLE_TRANSLATE_API_KEY);
    await persist(env, env.GOOGLE_TRANSLATE_API_KEY).catch(() => undefined);
    return env.GOOGLE_TRANSLATE_API_KEY;
  }
  return refreshSessionToken(env, clientUserAgent);
}
