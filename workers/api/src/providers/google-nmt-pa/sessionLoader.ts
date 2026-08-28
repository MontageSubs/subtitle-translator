import { Env } from "../../config/env";

export const dynamicSecrets: string[] = [];
let hotCache: string | null = null;
let activeRefreshPromise: Promise<string> | null = null;

export const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const SAFE_USER_AGENT_PATTERN = /^Mozilla\/5\.0 \([a-zA-Z0-9_.;\-\s]+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/[0-9.]+ Safari\/537\.36$/;

export function isStrictChrome(ua: string | undefined): boolean {
  if (!ua || ua.length > 256) return false;
  return SAFE_USER_AGENT_PATTERN.test(ua) && !ua.includes("Edg/") && !ua.includes("OPR/") && !ua.includes("Brave") && !ua.includes("Vivaldi");
}

function updateHotCache(token: string) {
  hotCache = token;
  if (token && token.trim().length >= 8 && !dynamicSecrets.includes(token)) {
    dynamicSecrets.push(token);
  }
}

export async function getSessionToken(env: Env, clientUserAgent?: string): Promise<string> {
  if (hotCache) {
    return hotCache;
  }

  try {
    const record = await env.DB.prepare("SELECT value FROM system_config WHERE key = 'pa_session_token'").first<{ value: string }>();
    if (record && record.value) {
      updateHotCache(record.value);
      return record.value;
    }
  } catch (e) {
  }

  if (env.GOOGLE_TRANSLATE_API_KEY) {
    updateHotCache(env.GOOGLE_TRANSLATE_API_KEY);
    try {
      await env.DB.prepare(
        "INSERT INTO system_config (key, value, updated_at) VALUES ('pa_session_token', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
      ).bind(env.GOOGLE_TRANSLATE_API_KEY, Date.now()).run();
    } catch (e) {
    }
    return env.GOOGLE_TRANSLATE_API_KEY;
  }

  return await refreshSessionToken(env, clientUserAgent);
}

export async function refreshSessionToken(env: Env, clientUserAgent?: string): Promise<string> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      console.log(JSON.stringify({ event: "session_token_refresh_started", ts: Date.now() }));
      
      const userAgent = isStrictChrome(clientUserAgent) ? clientUserAgent! : CHROME_UA;
      const scriptHeaders = {
        "User-Agent": userAgent,
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Dest": "script"
      };
      
      const elementRes = await fetch("https://translate.google.com/translate_a/element.js", {
        headers: scriptHeaders
      });
      const elementText = await elementRes.text();
      
      const scriptMatch = elementText.match(/['"]((?:https?:)?\\?\/\\?\/translate\.googleapis\.com\\?\/_\\?\/translate_http\\?\/_\\?\/js\\?\/[^'"]+)['"]/i);
      if (!scriptMatch || !scriptMatch[1]) {
        console.error(JSON.stringify({ event: "session_token_refresh_failed", reason: "script_not_found" }));
        throw new Error("Initialization failed");
      }

      let bundleUrl = scriptMatch[1];
      bundleUrl = bundleUrl.replace(/\\\//g, "/").replace(/\\x3d/gi, "=").replace(/\\u003d/gi, "=");
      if (bundleUrl.startsWith("//")) {
        bundleUrl = "https:" + bundleUrl;
      }

      const bundleRes = await fetch(bundleUrl, {
        headers: scriptHeaders
      });
      const bundleText = await bundleRes.text();

      const tokenMatch = bundleText.match(/['"]x-goog-api-key['"]\s*:\s*['"]([a-zA-Z0-9_\-]{39})['"]/i);
      if (!tokenMatch || !tokenMatch[1]) {
        console.error(JSON.stringify({ event: "session_token_refresh_failed", reason: "token_not_found" }));
        throw new Error("Initialization parse failed");
      }

      const token = tokenMatch[1];
      updateHotCache(token);

      try {
        await env.DB.prepare(
          "INSERT INTO system_config (key, value, updated_at) VALUES ('pa_session_token', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
        ).bind(token, Date.now()).run();
        console.log(JSON.stringify({ event: "session_token_refresh_success", ts: Date.now() }));
      } catch (e) {
        console.error(JSON.stringify({ event: "session_token_persist_failed", error: e instanceof Error ? e.message : String(e) }));
      }

      return token;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}
