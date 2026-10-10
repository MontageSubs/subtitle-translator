import type { Env } from "../../../../config/env";
import { registerRuntimeSecret } from "../../../../http/outputGuard";
import { errorMessage, logEngine } from "../../../../logging/log";
import { resolveChromeUserAgent } from "../../../../upstream/clientUserAgent";
import { egressBrowserFetch } from "../../../../upstream/egress";
import { readPaSessionToken, writePaSessionToken } from "../../../../upstream/paSessionStore";

const ELEMENT_SCRIPT_URL = "https://translate.google.com/translate_a/element.js";
const BUNDLE_URL_PATTERN = /['"]((?:https?:)?\\?\/\\?\/translate\.googleapis\.com\\?\/_\\?\/translate_http\\?\/_\\?\/js\\?\/[^'"]+)['"]/i;
const TOKEN_PATTERN = /['"]x-goog-api-key['"]\s*:\s*['"]([a-zA-Z0-9_\-]{39})['"]/i;

let hotToken: string | null = null;
let activeRefresh: Promise<string> | null = null;

function remember(token: string): void {
  hotToken = token;
  registerRuntimeSecret(token);
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
      const token = await scrapeToken(resolveChromeUserAgent(clientUserAgent));
      remember(token);
      await writePaSessionToken(env.DB, token).catch((error) => logEngine("google-pa", `session token persist failed: ${errorMessage(error)}`));
      return token;
    } finally {
      activeRefresh = null;
    }
  })();
  return activeRefresh;
}

export async function getSessionToken(env: Env, clientUserAgent?: string): Promise<string> {
  if (hotToken) return hotToken;
  const persisted = await readPaSessionToken(env.DB).catch(() => null);
  if (persisted) {
    remember(persisted);
    return persisted;
  }
  if (env.GOOGLE_TRANSLATE_API_KEY) {
    remember(env.GOOGLE_TRANSLATE_API_KEY);
    await writePaSessionToken(env.DB, env.GOOGLE_TRANSLATE_API_KEY).catch(() => undefined);
    return env.GOOGLE_TRANSLATE_API_KEY;
  }
  return refreshSessionToken(env, clientUserAgent);
}
